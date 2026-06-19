// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title SandboxToken
 * @notice Minimal ERC-20 used by IMSYSandboxRouter to represent simulated assets
 *         (e.g. sBTC, sETH, sSOL) on testnet. Owner = the router; the router mints
 *         on `swapNativeForToken` and accepts tokens back on `swapTokenForNative`.
 *         This contract is a sandbox primitive — it intentionally has no supply cap
 *         and no fee, and should never be used to represent a production asset.
 */
contract SandboxToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    address public minter;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterTransferred(address indexed oldMinter, address indexed newMinter);

    constructor(string memory _name, string memory _symbol, address _minter) {
        require(_minter != address(0), "Invalid minter");
        name = _name;
        symbol = _symbol;
        minter = _minter;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "Not minter");
        _;
    }

    function setMinter(address _minter) external onlyMinter {
        require(_minter != address(0), "Invalid minter");
        emit MinterTransferred(minter, _minter);
        minter = _minter;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "Invalid to");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyMinter {
        require(balanceOf[from] >= amount, "Burn exceeds balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "Allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        return _transfer(from, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(to != address(0), "Invalid to");
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
