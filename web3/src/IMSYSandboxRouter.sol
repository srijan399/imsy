// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title IMSYSandboxRouter
 * @notice Demo-only sandbox swap venue used by IMSYMarketFactory's executor when
 *         no liquid DEX is available on the target network (e.g. 0G Galileo).
 *
 *         Two pricing universes coexist:
 *
 *           1. USD universe (used by the IMSY factory): every token has a
 *              `usdPriceOf[symbol]` denominated in sUSD scaled to 1e18. Trades
 *              are quoted in sUSD; sUSD is itself a registered SandboxToken so
 *              `transferFrom` / `mint` / `burn` work.
 *
 *           2. Native universe (used by the cosmetic /swap on-ramp + off-ramp):
 *              `priceOf[symbol]` is native wei per 1e18 base units. The
 *              `usdPerNative` constant set at deploy turns native into sUSD at
 *              a fixed peg (default `1e10` sUSD per 0G).
 *
 *         The router has no AMM curve and no real liquidity provider. Buys mint
 *         tokens to the caller; sells burn the caller's tokens. The owner
 *         pre-funds the router with native for native-side cash-outs.
 */
interface ISandboxToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address) external view returns (uint256);
    function transferFrom(address, address, uint256) external returns (bool);
}

contract IMSYSandboxRouter {
    address public owner;

    /// sUSD address — set via `setSandboxUsd`. Required for USD swap functions.
    address public sandboxUsd;

    /// USD scaled (1e18) per 1e18 base units of native (so native → USD via
    /// `usdAmount = nativeAmount * usdPerNative / 1e18`). Default at deploy:
    /// `1e10 * 1e18` (= 1e28 raw) so 1 0G = 1e10 USD. Owner-updatable.
    uint256 public usdPerNative;

    /// `keccak256("symbol-string")`-equivalent — uses the same encoding as the
    /// factory's `executeTrade(asset)` so the router can be looked up by symbol.
    mapping(bytes32 => address) public tokenOf;

    /// priceWei = native units per 1e18 base units of the asset.
    mapping(bytes32 => uint256) public priceOf;

    /// usdPriceOf[symbol] = sUSD (scaled 1e18) per 1e18 base units of the asset.
    /// Source of truth for the USD universe; `priceOf` is derived from this and
    /// `usdPerNative` so the legacy native swap functions stay consistent.
    mapping(bytes32 => uint256) public usdPriceOf;

    bytes32[] public registeredAssets;

    event TokenRegistered(bytes32 indexed symbol, address indexed token, uint256 priceWei, uint256 priceUsd);
    event PriceUpdated(bytes32 indexed symbol, uint256 priceWei, uint256 priceUsd);
    event UsdPriceUpdated(bytes32 indexed symbol, uint256 priceUsd);
    event SandboxUsdSet(address indexed oldUsd, address indexed newUsd);
    event UsdPerNativeUpdated(uint256 oldRate, uint256 newRate);
    event Swapped(
        address indexed caller,
        bytes32 indexed symbol,
        bool buy,
        uint256 nativeAmount,
        uint256 tokenAmount,
        uint256 priceWei
    );
    event UsdSwapped(
        address indexed caller,
        bytes32 indexed symbol,
        bool buy,
        uint256 usdAmount,
        uint256 tokenAmount,
        uint256 priceUsd
    );
    event NativeUsdSwapped(address indexed caller, bool buyUsd, uint256 nativeAmount, uint256 usdAmount);
    event Funded(address indexed from, uint256 amount);
    event OwnerTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint256 _usdPerNative) {
        require(_usdPerNative > 0, "Invalid usdPerNative");
        owner = msg.sender;
        usdPerNative = _usdPerNative;
    }

    /* ── Owner / config ──────────────────────────────────── */

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setSandboxUsd(address usd) external onlyOwner {
        require(usd != address(0), "Invalid usd");
        emit SandboxUsdSet(sandboxUsd, usd);
        sandboxUsd = usd;
    }

    function setUsdPerNative(uint256 rate) external onlyOwner {
        require(rate > 0, "Invalid rate");
        emit UsdPerNativeUpdated(usdPerNative, rate);
        usdPerNative = rate;
    }

    /**
     * @notice Register a sandbox token. Caller supplies the USD price; the
     *         router stores both USD and the derived native-equivalent price.
     */
    function registerToken(bytes32 symbol, address token, uint256 priceUsd) external onlyOwner {
        require(symbol != bytes32(0), "Invalid symbol");
        require(token != address(0), "Invalid token");
        require(priceUsd > 0, "Invalid price");
        if (tokenOf[symbol] == address(0)) registeredAssets.push(symbol);
        tokenOf[symbol] = token;
        usdPriceOf[symbol] = priceUsd;
        uint256 nativePrice = (priceUsd * 1e18) / usdPerNative;
        priceOf[symbol] = nativePrice == 0 ? 1 : nativePrice;
        emit TokenRegistered(symbol, token, priceOf[symbol], priceUsd);
    }

    function setUsdPrice(bytes32 symbol, uint256 priceUsd) external onlyOwner {
        require(tokenOf[symbol] != address(0), "Not registered");
        require(priceUsd > 0, "Invalid price");
        usdPriceOf[symbol] = priceUsd;
        uint256 nativePrice = (priceUsd * 1e18) / usdPerNative;
        priceOf[symbol] = nativePrice == 0 ? 1 : nativePrice;
        emit PriceUpdated(symbol, priceOf[symbol], priceUsd);
        emit UsdPriceUpdated(symbol, priceUsd);
    }

    /// @dev Kept for backward compatibility with the original native-priced
    ///      callers. Recomputes the matching USD price on each update.
    function setPrice(bytes32 symbol, uint256 priceWei) external onlyOwner {
        require(tokenOf[symbol] != address(0), "Not registered");
        require(priceWei > 0, "Invalid price");
        priceOf[symbol] = priceWei;
        usdPriceOf[symbol] = (priceWei * usdPerNative) / 1e18;
        emit PriceUpdated(symbol, priceWei, usdPriceOf[symbol]);
    }

    function getRegisteredAssets() external view returns (bytes32[] memory) {
        return registeredAssets;
    }

    /* ── USD ↔ native ──────────────────────────────────── */

    function quoteUsdForNative(uint256 nativeIn) public view returns (uint256 usdOut) {
        usdOut = (nativeIn * usdPerNative) / 1e18;
    }

    function quoteNativeForUsd(uint256 usdIn) public view returns (uint256 nativeOut) {
        nativeOut = (usdIn * 1e18) / usdPerNative;
    }

    /// @notice Native → sUSD on-ramp. Mints sUSD to caller.
    function swapNativeForUsd(uint256 minOut) external payable returns (uint256 usdOut) {
        require(msg.value > 0, "Zero in");
        require(sandboxUsd != address(0), "USD not set");
        usdOut = quoteUsdForNative(msg.value);
        require(usdOut >= minOut, "Slippage");
        ISandboxToken(sandboxUsd).mint(msg.sender, usdOut);
        emit NativeUsdSwapped(msg.sender, true, msg.value, usdOut);
    }

    /// @notice sUSD → native off-ramp. Burns caller's sUSD, pays from router reserves.
    function swapUsdForNative(uint256 usdIn, uint256 minNativeOut) external returns (uint256 nativeOut) {
        require(usdIn > 0, "Zero in");
        require(sandboxUsd != address(0), "USD not set");
        nativeOut = quoteNativeForUsd(usdIn);
        require(nativeOut >= minNativeOut, "Slippage");
        require(address(this).balance >= nativeOut, "Insufficient liquidity");

        ISandboxToken(sandboxUsd).transferFrom(msg.sender, address(this), usdIn);
        ISandboxToken(sandboxUsd).burn(address(this), usdIn);

        (bool ok,) = msg.sender.call{value: nativeOut}("");
        require(ok, "Native transfer failed");
        emit NativeUsdSwapped(msg.sender, false, nativeOut, usdIn);
    }

    /* ── USD ↔ token (used by factory) ─────────────────── */

    function quoteBuyUsd(bytes32 symbol, uint256 usdIn) public view returns (uint256 tokenOut) {
        uint256 price = usdPriceOf[symbol];
        require(price > 0, "Not registered");
        tokenOut = (usdIn * 1e18) / price;
    }

    function quoteSellUsd(bytes32 symbol, uint256 tokenIn) public view returns (uint256 usdOut) {
        uint256 price = usdPriceOf[symbol];
        require(price > 0, "Not registered");
        usdOut = (tokenIn * price) / 1e18;
    }

    function swapUsdForToken(bytes32 symbol, uint256 usdIn, uint256 minTokenOut)
        external
        returns (uint256 tokenOut)
    {
        require(usdIn > 0, "Zero in");
        require(sandboxUsd != address(0), "USD not set");
        address token = tokenOf[symbol];
        require(token != address(0), "Not registered");
        uint256 price = usdPriceOf[symbol];
        require(price > 0, "Invalid price");
        require(symbol != bytes32("USD"), "USD not tradable");

        tokenOut = (usdIn * 1e18) / price;
        require(tokenOut >= minTokenOut, "Slippage");

        ISandboxToken(sandboxUsd).transferFrom(msg.sender, address(this), usdIn);
        ISandboxToken(sandboxUsd).burn(address(this), usdIn);
        ISandboxToken(token).mint(msg.sender, tokenOut);

        emit UsdSwapped(msg.sender, symbol, true, usdIn, tokenOut, price);
    }

    function swapTokenForUsd(bytes32 symbol, uint256 amountIn, uint256 minUsdOut)
        external
        returns (uint256 usdOut)
    {
        require(amountIn > 0, "Zero in");
        require(sandboxUsd != address(0), "USD not set");
        address token = tokenOf[symbol];
        require(token != address(0), "Not registered");
        uint256 price = usdPriceOf[symbol];
        require(price > 0, "Invalid price");
        require(symbol != bytes32("USD"), "USD not tradable");

        usdOut = (amountIn * price) / 1e18;
        require(usdOut >= minUsdOut, "Slippage");

        ISandboxToken(token).transferFrom(msg.sender, address(this), amountIn);
        ISandboxToken(token).burn(address(this), amountIn);
        ISandboxToken(sandboxUsd).mint(msg.sender, usdOut);

        emit UsdSwapped(msg.sender, symbol, false, usdOut, amountIn, price);
    }

    /* ── Native ↔ token (legacy /swap on-ramp helpers) ── */

    function quoteBuy(bytes32 symbol, uint256 nativeIn) external view returns (uint256 tokenOut) {
        uint256 price = priceOf[symbol];
        require(price > 0, "Not registered");
        tokenOut = (nativeIn * 1e18) / price;
    }

    function quoteSell(bytes32 symbol, uint256 tokenIn) external view returns (uint256 nativeOut) {
        uint256 price = priceOf[symbol];
        require(price > 0, "Not registered");
        nativeOut = (tokenIn * price) / 1e18;
    }

    function swapNativeForToken(bytes32 symbol, uint256 minOut) external payable returns (uint256 out) {
        require(msg.value > 0, "Zero in");
        uint256 price = priceOf[symbol];
        address token = tokenOf[symbol];
        require(token != address(0), "Not registered");
        require(price > 0, "Invalid price");

        out = (msg.value * 1e18) / price;
        require(out >= minOut, "Slippage");
        ISandboxToken(token).mint(msg.sender, out);

        emit Swapped(msg.sender, symbol, true, msg.value, out, price);
    }

    function swapTokenForNative(bytes32 symbol, uint256 amountIn, uint256 minNativeOut)
        external
        returns (uint256 nativeOut)
    {
        require(amountIn > 0, "Zero in");
        uint256 price = priceOf[symbol];
        address token = tokenOf[symbol];
        require(token != address(0), "Not registered");
        require(price > 0, "Invalid price");

        nativeOut = (amountIn * price) / 1e18;
        require(nativeOut >= minNativeOut, "Slippage");
        require(address(this).balance >= nativeOut, "Insufficient liquidity");

        ISandboxToken(token).transferFrom(msg.sender, address(this), amountIn);
        ISandboxToken(token).burn(address(this), amountIn);

        (bool ok,) = msg.sender.call{value: nativeOut}("");
        require(ok, "Native transfer failed");

        emit Swapped(msg.sender, symbol, false, nativeOut, amountIn, price);
    }

    /* ── Treasury ───────────────────────────────────────── */

    function fund() external payable onlyOwner {
        emit Funded(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid to");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
