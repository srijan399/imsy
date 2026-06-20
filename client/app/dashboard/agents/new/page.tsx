'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { decodeEventLog } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { SectionLabel } from '@/components/marketing-section-label';
import { MarketingHeader } from '@/components/marketing-header';
import {
  useCreateAgent,
  useLeagues,
  useSandboxUsdAddress,
  useUsdBalance,
} from '@/hooks/contracts/use-factory';
import { factoryAbi } from '@/lib/web3/abis';
import { waitForTransactionReceiptSafe } from '@/lib/web3/wait';
import { formatUsdCompact, usdToScaled } from '@/lib/web3/peg';
import { IconPicker } from '@/components/agents/icon-picker';
import {
  AGENT_COLORS,
  AGENT_ICONS,
  type AgentColor,
  type AgentIcon,
} from '@/lib/agents/icons';
import {
  createEmptyStrategyPlaybook,
  STRATEGY_LIST_FIELDS,
  STRATEGY_TEXT_FIELDS,
  STRATEGY_VERSION,
  type StrategyListFieldKey,
  type StrategyTextFieldKey,
} from '@/lib/agents/strategy';
import {
  EXAMPLE_NEW_AGENT_JSON,
  parseNewAgentJsonFromText,
} from '@/lib/agents/new-agent-import';

interface SeasonRow {
  chain_id_hex: string;
  name: string;
  status: string;
}

interface LeagueRow {
  chain_id_hex: string;
  name: string;
  type: string;
  asset_universe: string[];
  max_drawdown_pct: number;
  max_leverage: number;
  allowed_signals: string[];
  initial_capital: number;
  season_chain_id_hex: string;
}

const inp =
  'w-full bg-card border border-border/40 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none transition-colors';

export default function NewAgentPage() {
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const onChainLeagues = useLeagues();
  const createAgent = useCreateAgent();
  const sUsd = useSandboxUsdAddress();
  const usdBal = useUsdBalance(address);
  const sUsdAddress = sUsd.data as `0x${string}` | undefined;

  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [richLeagues, setRichLeagues] = useState<Record<string, LeagueRow>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<
    'idle' | 'uploading' | 'approving' | 'deploying' | 'indexing'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'form' | 'json'>('form');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonHint, setJsonHint] = useState<string | null>(null);
  const [autoFillDepositFromLeague, setAutoFillDepositFromLeague] =
    useState(true);
  const [form, setForm] = useState({
    name: '',
    league_id: '',
    description: '',
    playbook: createEmptyStrategyPlaybook(),
    allowed_signals: 'momentum,RSI',
    max_drawdown_pct: 20,
    max_position_size_pct: 30,
    leverage_cap: 1,
    deposit_usd: '',
    icon: AGENT_ICONS[0] as AgentIcon,
    color: AGENT_COLORS[0] as AgentColor,
  });

  useEffect(() => {
    let done = 0;
    const tryDone = () => { done++; if (done >= 2) setInitialLoading(false); };
    fetch('/api/seasons')
      .then((r) => r.json())
      .then((rows: SeasonRow[]) => setSeasons(rows))
      .catch(() => undefined)
      .finally(tryDone);
    fetch('/api/leagues')
      .then((r) => r.json())
      .then((rows: LeagueRow[]) => {
        const map: Record<string, LeagueRow> = {};
        for (const row of rows) map[row.chain_id_hex] = row;
        setRichLeagues(map);
      })
      .catch(() => undefined)
      .finally(tryDone);
  }, []);

  const eligibleLeagues = useMemo(() => {
    const seasonSet = new Set(
      seasons
        .filter((s) =>
          ['upcoming', 'registration', 'active'].includes(s.status),
        )
        .map((s) => s.chain_id_hex),
    );
    return (onChainLeagues.leagues ?? [])
      .filter((l) => seasonSet.has(l.seasonId.toLowerCase()))
      .map((l) => ({
        chain_id_hex: l.id.toLowerCase(),
        season_chain_id_hex: l.seasonId.toLowerCase(),
        name: l.name,
        rich: richLeagues[l.id.toLowerCase()],
      }));
  }, [onChainLeagues.leagues, richLeagues, seasons]);

  const selectedLeague = useMemo(
    () =>
      eligibleLeagues.find((league) => league.chain_id_hex === form.league_id),
    [eligibleLeagues, form.league_id],
  );

  useEffect(() => {
    if (!autoFillDepositFromLeague) return;
    const capital = selectedLeague?.rich?.initial_capital;
    if (!capital || capital <= 0) return;
    const nextDeposit = String(capital);
    setForm((current) =>
      current.deposit_usd === nextDeposit
        ? current
        : { ...current, deposit_usd: nextDeposit },
    );
  }, [
    selectedLeague?.chain_id_hex,
    selectedLeague?.rich?.initial_capital,
    autoFillDepositFromLeague,
  ]);

  const usdScaled = usdToScaled(Number(form.deposit_usd) || 0);
  const sUsdBalanceScaled = (usdBal.data as bigint | undefined) ?? 0n;
  const insufficientUsd = address ? sUsdBalanceScaled < usdScaled : false;
  const strategyReady = Boolean(
    form.description.trim() &&
    form.playbook.prime_directive.trim() &&
    form.playbook.trading_style.trim() &&
    form.allowed_signals.split(',').some((s) => s.trim()) &&
    STRATEGY_LIST_FIELDS.every((field) =>
      form.playbook[field.key].some((item) => item.trim()),
    ),
  );

  function updateTextField(key: StrategyTextFieldKey, value: string) {
    setForm((current) => ({
      ...current,
      playbook: { ...current.playbook, [key]: value },
    }));
  }

  function updateRule(key: StrategyListFieldKey, index: number, value: string) {
    setForm((current) => ({
      ...current,
      playbook: {
        ...current.playbook,
        [key]: current.playbook[key].map((item, i) =>
          i === index ? value : item,
        ),
      },
    }));
  }

  function addRule(key: StrategyListFieldKey) {
    setForm((current) => ({
      ...current,
      playbook: { ...current.playbook, [key]: [...current.playbook[key], ''] },
    }));
  }

  function removeRule(key: StrategyListFieldKey, index: number) {
    setForm((current) => {
      const next = current.playbook[key].filter((_, i) => i !== index);
      return {
        ...current,
        playbook: { ...current.playbook, [key]: next.length ? next : [''] },
      };
    });
  }

  function buildPlaybookForSubmit() {
    return {
      prime_directive: form.playbook.prime_directive.trim(),
      trading_style: form.playbook.trading_style.trim(),
      entry_rules: form.playbook.entry_rules
        .map((item) => item.trim())
        .filter(Boolean),
      exit_rules: form.playbook.exit_rules
        .map((item) => item.trim())
        .filter(Boolean),
      risk_rules: form.playbook.risk_rules
        .map((item) => item.trim())
        .filter(Boolean),
      sizing_rules: form.playbook.sizing_rules
        .map((item) => item.trim())
        .filter(Boolean),
      disallowed_actions: form.playbook.disallowed_actions
        .map((item) => item.trim())
        .filter(Boolean),
      evaluation_notes: form.playbook.evaluation_notes.trim(),
    };
  }

  function applyJsonImport() {
    setJsonHint(null);
    setError(null);
    const result = parseNewAgentJsonFromText(jsonDraft);
    if (!result.ok) {
      setJsonHint(result.error);
      return;
    }
    const data = result.data;
    // league_id from JSON is optional — only apply it if it matches an eligible league
    const resolvedLeagueId =
      data.league_id &&
      eligibleLeagues.some((l) => l.chain_id_hex === data.league_id)
        ? data.league_id
        : form.league_id; // keep existing selection if JSON league_id not present/matched
    setAutoFillDepositFromLeague(!data.hadExplicitDeposit);
    setForm((prev) => ({
      ...prev,
      name: data.name,
      league_id: resolvedLeagueId,
      description: data.description,
      playbook: data.playbook,
      allowed_signals: data.allowed_signals,
      max_drawdown_pct: data.max_drawdown_pct,
      max_position_size_pct: data.max_position_size_pct,
      leverage_cap: data.leverage_cap,
      deposit_usd: data.deposit_usd,
      icon: data.icon,
      color: data.color,
    }));
    setJsonHint(null);
    // Auto-switch to form tab
    setInputMode('form');
    toast.success('Fields pre-filled from JSON', {
      description: 'Select your league from the dropdown, verify the deposit, then register.',
    });
    requestAnimationFrame(() => {
      document
        .getElementById('new-agent-league')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!address) throw new Error('Connect a wallet first');
      if (!sUsdAddress)
        throw new Error('sUSD address not configured on factory');
      const selected = selectedLeague;
      if (!selected) throw new Error('Pick a league');
      if (!publicClient) throw new Error('Public client not ready');
      if (usdScaled === 0n) throw new Error('Enter a positive deposit');
      if (insufficientUsd)
        throw new Error('Buy sUSD on /swap before registering an agent');

      setStep('uploading');
      const strategyDoc = {
        name: form.name,
        description: form.description.trim(),
        playbook: buildPlaybookForSubmit(),
        risk_profile: {
          max_drawdown_pct: form.max_drawdown_pct,
          max_position_size_pct: form.max_position_size_pct,
          leverage_cap: form.leverage_cap,
        },
        allowed_signals: form.allowed_signals
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        asset_universe: selected.rich?.asset_universe ?? [],
        league_id: selected.chain_id_hex,
      };
      const upload = await fetch('/api/agents/upload-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(strategyDoc),
      });
      const uploadBody = await upload.json();
      if (!upload.ok)
        throw new Error(uploadBody.error ?? 'Strategy upload failed');
      const strategyRoot = ensureBytes32(
        uploadBody.rootHash,
        uploadBody.sha256Hash,
      );

      setStep('approving');
      // submit() does approve + createAgent in two txs.
      const { hash } = await createAgent.submit({
        name: form.name,
        strategyRoot,
        leagueIds: [selected.chain_id_hex as `0x${string}`],
        depositUsdScaled: usdScaled,
        sUsdAddress,
      });

      setStep('deploying');
      const receipt = await waitForTransactionReceiptSafe(publicClient, {
        hash,
      });
      let agentId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({
            abi: factoryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (parsed.eventName === 'AgentCreated') {
            agentId = Number((parsed.args as { agentId: bigint }).agentId);
            break;
          }
        } catch {
          // skip non-matching logs
        }
      }
      if (agentId === null)
        throw new Error('AgentCreated event not found in receipt');

      setStep('indexing');
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          name: form.name,
          owner_wallet: address,
          strategy_root: strategyRoot,
          leagues: [selected.chain_id_hex],
          season_chain_id_hex: selected.season_chain_id_hex,
          deposit_usd: usdScaled.toString(),
          deploy_tx_hash: hash,
          icon: form.icon,
          color: form.color,
          strategy: {
            description: form.description,
            sha256_hash: uploadBody.sha256Hash,
            zg_storage_status: uploadBody.status,
            zg_storage_tx_hash: uploadBody.txHash,
            zg_storage_error: uploadBody.error,
            risk_profile: strategyDoc.risk_profile,
            playbook: uploadBody.doc?.playbook ?? strategyDoc.playbook,
            allowed_signals: strategyDoc.allowed_signals,
            asset_universe: strategyDoc.asset_universe,
            version: STRATEGY_VERSION,
          },
        }),
      });
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: 'Indexing failed' }));
        throw new Error(body.error ?? 'Indexing failed');
      }

      router.push(`/dashboard/agents/${agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
      setStep('idle');
    }
  }

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full max-w-2xl">
        <SectionLabel>Register</SectionLabel>
        <h1 className="mt-4 mb-12 font-[--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">
          New Agent
        </h1>
        {initialLoading && (onChainLeagues.isLoading || seasons.length === 0) ? (
          <div className="flex items-center gap-3 p-16 font-mono text-xs text-muted-foreground border border-border/40">
            <span className="inline-block size-4 border border-accent/60 border-t-transparent rounded-full animate-spin" />
            Loading seasons &amp; leagues…
          </div>
        ) : null}
        <form
          onSubmit={handleSubmit}
          className={`space-y-6 ${initialLoading && onChainLeagues.isLoading ? 'opacity-50 pointer-events-none' : ''}`}
          noValidate={inputMode === 'json'}
        >

          <div className="flex flex-wrap gap-2 border border-border/40 p-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground w-full mb-1">
              Input mode
            </span>
            <button
              type="button"
              onClick={() => {
                setInputMode('form');
                setJsonHint(null);
              }}
              className={`border px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                inputMode === 'form'
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-border/40 text-muted-foreground hover:border-accent/50'
              }`}
            >
              Form
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode('json');
                setJsonHint(null);
              }}
              className={`border px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                inputMode === 'json'
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-border/40 text-muted-foreground hover:border-accent/50'
              }`}
            >
              JSON import
            </button>
          </div>

          {inputMode === 'json' ? (
            <div className="space-y-3 border border-border/40 p-4">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block">
                Agent JSON
              </label>
              <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                Paste your agent JSON below. Required:{' '}
                <code className="text-foreground/90">name</code>,{' '}
                <code className="text-foreground/90">description</code>,{' '}
                <code className="text-foreground/90">playbook</code>,{' '}
                <code className="text-foreground/90">allowed_signals</code>{' '}
                (array or comma string),{' '}
                <code className="text-foreground/90">risk_profile</code>.
                Optional:{' '}
                <code className="text-foreground/90">deposit_usd</code>,{' '}
                <code className="text-foreground/90">icon</code>,{' '}
                <code className="text-foreground/90">color</code>.{' '}
                <strong className="text-foreground/80">League is selected from the dropdown</strong>{' '}after importing.
              </p>
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                placeholder={EXAMPLE_NEW_AGENT_JSON}
                rows={18}
                spellCheck={false}
                className={`${inp} font-mono text-xs leading-relaxed resize-y min-h-70`}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyJsonImport}
                  className="border border-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10 transition-colors"
                >
                  Apply to form
                </button>
                <button
                  type="button"
                  onClick={() => setJsonDraft(EXAMPLE_NEW_AGENT_JSON)}
                  className="border border-border/40 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-accent/50 transition-colors"
                >
                  Load example
                </button>
              </div>
              {jsonHint && (
                <p
                  className={`font-mono text-[10px] leading-relaxed ${
                    jsonHint.startsWith('Fields') || jsonHint.startsWith('Imported')
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                >
                  {jsonHint}
                </p>
              )}
            </div>
          ) : null}

          <div className={inputMode === 'json' ? 'hidden' : 'space-y-6'}>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Agent name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="AlphaBot-7"
                className={inp}
                required
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Identity
              </label>
              <IconPicker
                icon={form.icon}
                color={form.color}
                onChange={(next) =>
                  setForm({ ...form, icon: next.icon, color: next.color })
                }
              />
            </div>

            <div id="new-agent-league">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                League
              </label>
              <select
                value={form.league_id}
                onChange={(e) => {
                  setAutoFillDepositFromLeague(true);
                  setForm({ ...form, league_id: e.target.value });
                }}
                className={inp}
                required
              >
                <option value="">Select a league</option>
                {eligibleLeagues.map((l) => (
                  <option key={l.chain_id_hex} value={l.chain_id_hex}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Strategy description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Momentum on majors with defensive cash rotation when signals weaken."
                rows={3}
                className={inp}
                required
              />
            </div>

            <div className="space-y-5 border-y border-border/30 py-6">
              <SectionLabel>Behavior imprint</SectionLabel>
              {STRATEGY_TEXT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                    {field.label}
                  </label>
                  <textarea
                    value={form.playbook[field.key]}
                    onChange={(e) => updateTextField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={field.key === 'evaluation_notes' ? 3 : 2}
                    className={inp}
                    required={field.key !== 'evaluation_notes'}
                  />
                </div>
              ))}

              {STRATEGY_LIST_FIELDS.map((field) => (
                <div key={field.key}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {field.label}
                    </label>
                    <button
                      type="button"
                      onClick={() => addRule(field.key)}
                      title={`Add ${field.label.toLowerCase()}`}
                      className="inline-flex items-center gap-1 border border-border/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                    >
                      <Plus className="size-3" />
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.playbook[field.key].map((item, index) => (
                      <div
                        key={`${field.key}-${index}`}
                        className="grid grid-cols-[1fr_auto] gap-2"
                      >
                        <input
                          type="text"
                          value={item}
                          onChange={(e) =>
                            updateRule(field.key, index, e.target.value)
                          }
                          placeholder={
                            index === 0
                              ? field.placeholder
                              : `${field.label} ${index + 1}`
                          }
                          className={inp}
                          required={index === 0}
                        />
                        <button
                          type="button"
                          onClick={() => removeRule(field.key, index)}
                          title={`Remove ${field.label.toLowerCase()}`}
                          className="size-11 border border-border/40 inline-flex items-center justify-center text-muted-foreground hover:border-red-400/60 hover:text-red-400 transition-colors"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Signals (comma-separated)
              </label>
              <input
                type="text"
                value={form.allowed_signals}
                onChange={(e) =>
                  setForm({ ...form, allowed_signals: e.target.value })
                }
                className={inp}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                  Max drawdown %
                </label>
                <input
                  type="number"
                  value={form.max_drawdown_pct}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_drawdown_pct: Number(e.target.value),
                    })
                  }
                  className={inp}
                  min="1"
                  max="100"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                  Max position %
                </label>
                <input
                  type="number"
                  value={form.max_position_size_pct}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_position_size_pct: Number(e.target.value),
                    })
                  }
                  className={inp}
                  min="1"
                  max="100"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                  Leverage cap
                </label>
                <input
                  type="number"
                  value={form.leverage_cap}
                  onChange={(e) =>
                    setForm({ ...form, leverage_cap: Number(e.target.value) })
                  }
                  className={inp}
                  min="1"
                  max="10"
                />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Initial deposit (sUSD)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={form.deposit_usd}
                onChange={(e) => {
                  setAutoFillDepositFromLeague(false);
                  setForm({ ...form, deposit_usd: e.target.value });
                }}
                className={inp}
                required
              />
              <p className="font-mono text-[10px] text-muted-foreground mt-1">
                Sandbox sUSD held by the central trading contract for this
                agent. Buy sUSD on{' '}
                <Link href="/swap" className="text-accent hover:underline">
                  /swap
                </Link>
                . Wallet sUSD = {formatUsdCompact(sUsdBalanceScaled)}.
                {insufficientUsd && address && (
                  <span className="text-red-400"> Insufficient sUSD.</span>
                )}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              loading ||
              !address ||
              !form.name ||
              !form.league_id ||
              !form.deposit_usd ||
              !strategyReady ||
              insufficientUsd
            }
            className="w-full py-4 border border-accent text-accent font-mono text-xs uppercase tracking-widest hover:bg-accent/10 transition-all duration-200 disabled:border-border/30 disabled:text-muted-foreground/40 disabled:cursor-not-allowed"
          >
            {loading
              ? step === 'uploading'
                ? 'Sealing strategy on 0G…'
                : step === 'approving'
                  ? 'Approving sUSD…'
                  : step === 'deploying'
                    ? 'Deploying agent…'
                    : 'Indexing…'
              : address
                ? 'Register & seal strategy'
                : 'Connect wallet to continue'}
          </button>
          {error && (
            <p className="font-mono text-[10px] leading-relaxed text-red-400">
              {error}
            </p>
          )}
        </form>
        <footer className="pt-12 border-t border-border/30 mt-16">
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Dashboard
          </Link>
        </footer>
      </div>
    </main>
  );
}

function ensureBytes32(rootHash: string, fallbackSha: string): `0x${string}` {
  if (rootHash?.startsWith('0x') && rootHash.length === 66)
    return rootHash as `0x${string}`;
  if (rootHash?.startsWith('0x') && rootHash.length > 66)
    return rootHash.slice(0, 66) as `0x${string}`;
  if (fallbackSha)
    return `0x${fallbackSha.slice(0, 64).padEnd(64, '0')}` as `0x${string}`;
  throw new Error('Strategy upload returned no rootHash');
}
