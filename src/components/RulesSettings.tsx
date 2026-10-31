import { useState } from 'react';
import { escapeTarget } from '../../shared/engine';
import { EXIT_STATION, SECOND_EXIT, STATIONS, stationLabel } from '../../shared/map';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';
import './RulesSettings.css';

interface Preset {
  id: string;
  name: string;
  tagline: string;
  desc: string;
  settings: Partial<Settings>;
}

export const RULE_PRESETS: Preset[] = [
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'Balanced game. Good for most groups.',
    desc: 'Balanced official rules: 15 rounds, 45–60s timers, 10 artifacts, 3-stop search',
    settings: {
      maxRounds: 15,
      heisterSeconds: 60,
      policeSeconds: 45,
      infoSeconds: 60,
      setupSeconds: 60,
      artifactCount: 10,
      searchRange: 3,
      heisterCount: 'auto',
      customExits: [],
    },
  },
  {
    id: 'blitz',
    name: 'Blitz',
    tagline: 'Fast and intense. Fewer rounds and shorter timers.',
    desc: 'Fast & intense: 10 rounds, 30s timers, 8 artifacts, 2-stop search',
    settings: {
      maxRounds: 10,
      heisterSeconds: 45,
      policeSeconds: 30,
      infoSeconds: 30,
      setupSeconds: 45,
      artifactCount: 8,
      searchRange: 2,
      heisterCount: 'auto',
      customExits: [],
    },
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    tagline: 'Best for beginners. More time to think and talk.',
    desc: 'Generous time for beginners: 20 rounds, 60–90s timers, 12 artifacts, 3-stop search',
    settings: {
      maxRounds: 20,
      heisterSeconds: 90,
      policeSeconds: 60,
      infoSeconds: 90,
      setupSeconds: 90,
      artifactCount: 12,
      searchRange: 3,
      heisterCount: 'auto',
      customExits: [],
    },
  },
];

const POPULAR_TERMINALS = [
  { id: 'central_terminal', name: 'Central Terminal (Green)' },
  { id: 'clark_airport', name: 'Clark Airport (Red)' },
  { id: 'sjdm', name: 'San Jose del Monte (Pink)' },
  { id: 'fpj', name: 'Fernando Poe Jr. (Green)' },
  { id: 'e_valenzuela', name: 'E. Valenzuela (Blue)' },
  { id: 'cainta', name: 'Cainta (Orange)' },
  { id: 'pitx', name: 'PITX (Purple)' },
  { id: 'tutuban', name: 'Tutuban Terminal (Purple)' },
];

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

// One line of numbers for a preset card, worked out from its real settings so it never goes stale.
function presetFacts(s: Partial<Settings>): string {
  const times = [s.heisterSeconds, s.policeSeconds, s.infoSeconds, s.setupSeconds].filter((x): x is number => typeof x === 'number');
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const timers = lo === hi ? `${lo}s` : `${lo}–${hi}s`;
  return `${s.maxRounds} rounds · ${timers} timers · ${s.artifactCount} Artifacts · ${s.searchRange}-stop search`;
}

interface NumberStepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  formatted?: string;
  disabled?: boolean;
  onChange: (val: number) => void;
  ariaLabel: string;
}

export function NumberStepper({
  value,
  min,
  max,
  step = 1,
  suffix,
  formatted,
  disabled = false,
  onChange,
  ariaLabel,
}: NumberStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const display = draft !== null ? draft : String(value);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const handleMinus = () => {
    if (disabled) return;
    const next = clamp(value - step);
    setDraft(null);
    onChange(next);
  };

  const handlePlus = () => {
    if (disabled) return;
    const next = clamp(value + step);
    setDraft(null);
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDraft(text);
    const n = parseInt(text, 10);
    if (!isNaN(n) && n >= min && n <= max) {
      onChange(n);
    }
  };

  const handleBlur = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    if (isNaN(n)) {
      setDraft(null);
      onChange(value);
    } else {
      setDraft(null);
      onChange(clamp(n));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handlePlus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleMinus();
    }
  };

  return (
    <div className={`rules-stepper-wrap`}>
      <div className={`rules-stepper ${disabled ? 'disabled' : ''}`}>
        <button
          type="button"
          className="rules-step-btn minus"
          onClick={handleMinus}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${ariaLabel}`}
          title={`Decrease by ${step}`}
        >
          −
        </button>

        <div className="rules-step-input-wrap">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="rules-step-input"
            value={display}
            disabled={disabled}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
          />
          {suffix && <span className="rules-step-suffix">{suffix}</span>}
        </div>

        <button
          type="button"
          className="rules-step-btn plus"
          onClick={handlePlus}
          disabled={disabled || value >= max}
          aria-label={`Increase ${ariaLabel}`}
          title={`Increase by ${step}`}
        >
          +
        </button>
      </div>

      {formatted && <span className="rules-step-formatted">{formatted}</span>}
    </div>
  );
}

// Plain read-only list of what the host set. Everyone sees this; only the host gets the editor.
function RulesSummary({ settings, showDMs, presetName }: { settings: Settings; showDMs: boolean; presetName?: string | null }) {
  const exits = settings.customExits ?? [];
  const range = settings.searchRange;
  const rows: [string, string][] = [];
  if (presetName !== undefined) rows.push(['Preset', presetName ?? 'Custom']);
  rows.push(
    ['Rounds', String(settings.maxRounds)],
    ['Artifacts on the board', `${settings.artifactCount} (a Heister escapes with ${escapeTarget(settings)})`],
    ['Police search range', range === 0 ? 'Own station only' : `${range} station${range === 1 ? '' : 's'} away`],
    ['Escape exits', exits.length === 0 ? 'Auto (1 or 2)' : exits.map((id) => stationLabel(id)).join(', ')],
    [
      'Timers',
      `Heisters ${formatSeconds(settings.heisterSeconds)} · each Officer ${formatSeconds(settings.policeSeconds)} · Information ${formatSeconds(settings.infoSeconds)} · Setup ${formatSeconds(settings.setupSeconds)}`,
    ],
    ['Heisters (6–7 players)', settings.heisterCount === 'auto' ? '2 Heisters' : '1 Heister'],
  );
  if (showDMs) rows.push(['Secret DMs', settings.allowDMs ? 'On' : 'Off']);
  return (
    <div className="rules-summary">
      {rows.map(([label, value]) => (
        <div className="rules-summary-row" key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

export interface RulesSettingsProps {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  isHost?: boolean;
  showDMs?: boolean;
  heisterCountDisabled?: boolean;
  heisterCountNote?: string;
  extraFooter?: React.ReactNode;
}

type TabType = 'all' | 'objectives' | 'timers' | 'options';

export function RulesSettings({
  settings,
  onChange,
  isHost = true,
  showDMs = true,
  heisterCountDisabled = false,
  heisterCountNote,
  extraFooter,
}: RulesSettingsProps) {
  const [tab, setTab] = useState<TabType>('all');

  // Detect which preset matches
  const activePreset = RULE_PRESETS.find((p) => {
    const s = p.settings;
    return (
      settings.maxRounds === s.maxRounds &&
      settings.artifactCount === s.artifactCount &&
      settings.searchRange === s.searchRange &&
      settings.heisterSeconds === s.heisterSeconds &&
      settings.policeSeconds === s.policeSeconds &&
      settings.infoSeconds === s.infoSeconds &&
      settings.setupSeconds === s.setupSeconds
    );
  })?.id;
  const activePresetName = RULE_PRESETS.find((p) => p.id === activePreset)?.name ?? null;

  const isDefault =
    settings.maxRounds === DEFAULT_SETTINGS.maxRounds &&
    settings.artifactCount === DEFAULT_SETTINGS.artifactCount &&
    settings.searchRange === DEFAULT_SETTINGS.searchRange &&
    settings.heisterSeconds === DEFAULT_SETTINGS.heisterSeconds &&
    settings.policeSeconds === DEFAULT_SETTINGS.policeSeconds &&
    settings.infoSeconds === DEFAULT_SETTINGS.infoSeconds &&
    settings.setupSeconds === DEFAULT_SETTINGS.setupSeconds &&
    settings.heisterCount === DEFAULT_SETTINGS.heisterCount &&
    (!showDMs || settings.allowDMs === DEFAULT_SETTINGS.allowDMs);

  const applyPreset = (preset: Preset) => {
    if (!isHost) return;
    onChange(preset.settings);
  };

  const resetDefaults = () => {
    if (!isHost) return;
    onChange(DEFAULT_SETTINGS);
  };

  // Everyone except the host just sees what the host chose.
  if (!isHost) {
    return (
      <div className="rules-container">
        <div className="rules-head">
          <h3>
            Game rules
            <span className="rules-head-badge">Set by host</span>
          </h3>
        </div>
        <p className="hint">Only the host can change these.</p>
        <div className="rules-card">
          <RulesSummary settings={settings} showDMs={showDMs} presetName={activePresetName} />
        </div>
        {extraFooter}
      </div>
    );
  }

  const timerChips = [30, 45, 60, 90];

  const searchOptions = [
    { value: 0, label: '0 stops', hint: 'Officers only sweep the station they occupy' },
    { value: 1, label: '1 stop', hint: 'Short sweep: Officers search stations up to 1 stop away' },
    { value: 2, label: '2 stops', hint: 'Medium sweep: Officers search stations up to 2 stops away' },
    { value: 3, label: '3 stops (Default)', hint: 'Default: Broad grid — officers search stations up to 3 stops away' },
  ];

  const customExits = settings.customExits ?? [];
  const exitMode =
    customExits.length === 0
      ? 'auto'
      : customExits.length === 1 && customExits[0] === EXIT_STATION
      ? 'single'
      : customExits.length === 2 &&
        customExits.includes(EXIT_STATION) &&
        customExits.includes(SECOND_EXIT)
      ? 'double'
      : 'custom';
  const activeExits = exitMode === 'auto' ? [EXIT_STATION, SECOND_EXIT] : customExits;

  const showObjectives = tab === 'all' || tab === 'objectives';
  const showTimers = tab === 'all' || tab === 'timers';
  const showOptions = tab === 'all' || tab === 'options';

  return (
    <div className="rules-container">
      <div className="rules-head">
        <h3>
          Game rules
          <span className="rules-head-badge host">You set these</span>
        </h3>

        {!isDefault && (
          <button
            type="button"
            className="rules-preset-reset"
            onClick={resetDefaults}
            title="Reset to default official settings"
          >
            Reset defaults
          </button>
        )}
      </div>

      {/* Presets as cards, each with a one-line explanation and its real numbers */}
      <div className="rules-group-title">
        <span>Choose a preset</span>
      </div>
      <div className="rules-presets-cards" role="radiogroup" aria-label="Rule presets">
        {RULE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={activePreset === p.id}
            className={`rules-preset-card ${activePreset === p.id ? 'active' : ''}`}
            onClick={() => applyPreset(p)}
            title={p.desc}
          >
            <strong>{p.name}</strong>
            <span>{p.tagline}</span>
            <small>{presetFacts(p.settings)}</small>
          </button>
        ))}
      </div>
      {!activePreset && <p className="hint">Custom settings: you changed something from the presets.</p>}

      <div className="rules-group-title">
        <span>Current settings</span>
      </div>
      <div className="rules-card">
        <RulesSummary settings={settings} showDMs={showDMs} />
      </div>

      <details className="rules-advanced">
        <summary>Advanced settings</summary>

        {/* Filter Tabs */}
        <nav className="rules-tabs" aria-label="Rule categories">
          <button
            type="button"
            className={`rules-tab ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`rules-tab ${tab === 'objectives' ? 'active' : ''}`}
            onClick={() => setTab('objectives')}
          >
            Objectives
          </button>
          <button
            type="button"
            className={`rules-tab ${tab === 'timers' ? 'active' : ''}`}
            onClick={() => setTab('timers')}
          >
            Timers
          </button>
          <button
            type="button"
            className={`rules-tab ${tab === 'options' ? 'active' : ''}`}
            onClick={() => setTab('options')}
          >
            Options
          </button>
        </nav>

        {/* Group: Objectives & Rounds */}
        {showObjectives && (
          <div className="rules-group">
            <div className="rules-group-title">
              <span>Objectives &amp; Rounds</span>
            </div>

            {/* Max Rounds */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Rounds</span>
                <span className="rules-card-badge subtle">{settings.maxRounds} rounds</span>
              </div>
              <p className="rules-card-desc">Game ends if the Heisters haven't escaped by this round.</p>
              <NumberStepper
                value={settings.maxRounds}
                min={1}
                max={50}
                step={1}
                suffix="rnd"
                onChange={(val) => onChange({ maxRounds: val })}
                ariaLabel="Game rounds"
              />
            </div>

            {/* Artifacts on the board */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Artifacts on the board</span>
                <span className="rules-card-badge">Escape needs {escapeTarget(settings)}</span>
              </div>
              <p className="rules-card-desc">
                Total Artifacts (loot) on the board. A Heister escapes by bringing {escapeTarget(settings)}{' '}
                (half, rounded up) to an exit.
              </p>
              <NumberStepper
                value={settings.artifactCount}
                min={1}
                max={30}
                step={1}
                suffix="loot"
                onChange={(val) => onChange({ artifactCount: val })}
                ariaLabel="Artifacts on the board"
              />
            </div>

            {/* Search Range */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">How far police can search</span>
                <span className="rules-card-badge subtle">{settings.searchRange} stop{settings.searchRange === 1 ? '' : 's'}</span>
              </div>
              <p className="rules-card-desc">
                {searchOptions.find((o) => o.value === settings.searchRange)?.hint}. A stop is one station along a line.
              </p>
              <div className="rules-segmented" role="radiogroup" aria-label="Police Search Range">
                {searchOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={settings.searchRange === opt.value}
                    className={`rules-segmented-btn ${settings.searchRange === opt.value ? 'active' : ''}`}
                    onClick={() => onChange({ searchRange: opt.value })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Escape Exits */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Escape exits</span>
                <span className="rules-card-badge subtle">
                  {exitMode === 'auto'
                    ? 'Auto (1–2 exits)'
                    : `${customExits.length} exit${customExits.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <p className="rules-card-desc">
                Heisters escape by reaching any active exit with half the Artifacts ({escapeTarget(settings)} loot). Officers must vacate an exit if occupying it for 2 consecutive rounds.
              </p>

              <div className="rules-segmented" role="radiogroup" aria-label="Exit Stations">
                <button
                  type="button"
                  role="radio"
                  aria-checked={exitMode === 'auto'}
                  className={`rules-segmented-btn ${exitMode === 'auto' ? 'active' : ''}`}
                  onClick={() => onChange({ customExits: [] })}
                >
                  Auto (Default)
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={exitMode === 'single'}
                  className={`rules-segmented-btn ${exitMode === 'single' ? 'active' : ''}`}
                  onClick={() => onChange({ customExits: [EXIT_STATION] })}
                >
                  Central Terminal
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={exitMode === 'double'}
                  className={`rules-segmented-btn ${exitMode === 'double' ? 'active' : ''}`}
                  onClick={() => onChange({ customExits: [EXIT_STATION, SECOND_EXIT] })}
                >
                  2 Exits
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={exitMode === 'custom'}
                  className={`rules-segmented-btn ${exitMode === 'custom' ? 'active' : ''}`}
                  onClick={() => {
                    if (exitMode !== 'custom') {
                      onChange({ customExits: [EXIT_STATION, SECOND_EXIT] });
                    }
                  }}
                >
                  Custom…
                </button>
              </div>

              <div className="rules-exit-wrap">
                <div className="rules-exit-chips">
                  <span className="rules-presets-label">Active exits:</span>
                  {activeExits.map((id) => (
                    <span key={id} className="rules-exit-chip">
                      <i className="exit-icon" />
                      {stationLabel(id)}
                      {exitMode !== 'auto' && customExits.length > 1 && (
                        <button
                          type="button"
                          className="rules-exit-remove"
                          onClick={() => onChange({ customExits: customExits.filter((x) => x !== id) })}
                          title={`Remove ${stationLabel(id)} as exit`}
                          aria-label={`Remove ${stationLabel(id)}`}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {exitMode === 'custom' && (
                  <>
                    <div className="rules-exit-dropdown-row">
                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !customExits.includes(val) && customExits.length < 5) {
                            onChange({ customExits: [...customExits, val] });
                          }
                        }}
                        disabled={customExits.length >= 5}
                      >
                        <option value="">+ Add any station as exit…</option>
                        {STATIONS.filter((s) => !customExits.includes(s.id))
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="rules-exit-terminals">
                      <span className="rules-presets-label">Quick terminals:</span>
                      {POPULAR_TERMINALS.map((t) => {
                        const isActive = customExits.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={`rules-terminal-btn ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              if (isActive) {
                                if (customExits.length > 1) {
                                  onChange({ customExits: customExits.filter((x) => x !== t.id) });
                                }
                              } else {
                                if (customExits.length < 5) {
                                  onChange({ customExits: [...customExits, t.id] });
                                }
                              }
                            }}
                          >
                            {isActive ? '✓ ' : '+ '}{t.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Group: Phase Timers */}
        {showTimers && (
          <div className="rules-group">
            <div className="rules-group-title">
              <span>Phase Timers</span>
            </div>

            {/* Heister Phase */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Heister Phase</span>
                <span className="rules-card-badge">{formatSeconds(settings.heisterSeconds)}</span>
              </div>
              <p className="rules-card-desc">Turn timer for all heisters to coordinate, move, and loot.</p>
              <div className="rules-stepper-wrap">
                <NumberStepper
                  value={settings.heisterSeconds}
                  min={10}
                  max={600}
                  step={5}
                  suffix="sec"
                  formatted={formatSeconds(settings.heisterSeconds)}
                  onChange={(val) => onChange({ heisterSeconds: val })}
                  ariaLabel="Heister Phase duration in seconds"
                />
                <div className="rules-quick-chips">
                  {timerChips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rules-chip ${settings.heisterSeconds === s ? 'active' : ''}`}
                      onClick={() => onChange({ heisterSeconds: s })}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Police Turn */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Each Officer’s Turn</span>
                <span className="rules-card-badge">{formatSeconds(settings.policeSeconds)}</span>
              </div>
              <p className="rules-card-desc">Individual timer allocated per police officer during Police Phase.</p>
              <div className="rules-stepper-wrap">
                <NumberStepper
                  value={settings.policeSeconds}
                  min={10}
                  max={600}
                  step={5}
                  suffix="sec"
                  formatted={formatSeconds(settings.policeSeconds)}
                  onChange={(val) => onChange({ policeSeconds: val })}
                  ariaLabel="Police turn duration in seconds"
                />
                <div className="rules-quick-chips">
                  {timerChips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rules-chip ${settings.policeSeconds === s ? 'active' : ''}`}
                      onClick={() => onChange({ policeSeconds: s })}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Information Phase */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Information Phase</span>
                <span className="rules-card-badge">{formatSeconds(settings.infoSeconds)}</span>
              </div>
              <p className="rules-card-desc">Time to inspect revealed clues, dispatch log, and station envelopes.</p>
              <div className="rules-stepper-wrap">
                <NumberStepper
                  value={settings.infoSeconds}
                  min={10}
                  max={600}
                  step={5}
                  suffix="sec"
                  formatted={formatSeconds(settings.infoSeconds)}
                  onChange={(val) => onChange({ infoSeconds: val })}
                  ariaLabel="Information Phase duration in seconds"
                />
                <div className="rules-quick-chips">
                  {timerChips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rules-chip ${settings.infoSeconds === s ? 'active' : ''}`}
                      onClick={() => onChange({ infoSeconds: s })}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Setup Phase */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Setup Phase</span>
                <span className="rules-card-badge">{formatSeconds(settings.setupSeconds)}</span>
              </div>
              <p className="rules-card-desc">Time for players to choose initial stations before Round 1.</p>
              <div className="rules-stepper-wrap">
                <NumberStepper
                  value={settings.setupSeconds}
                  min={10}
                  max={600}
                  step={5}
                  suffix="sec"
                  formatted={formatSeconds(settings.setupSeconds)}
                  onChange={(val) => onChange({ setupSeconds: val })}
                  ariaLabel="Setup duration in seconds"
                />
                <div className="rules-quick-chips">
                  {timerChips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rules-chip ${settings.setupSeconds === s ? 'active' : ''}`}
                      onClick={() => onChange({ setupSeconds: s })}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Group: Game Options */}
        {showOptions && (
          <div className="rules-group">
            <div className="rules-group-title">
              <span>Table Options</span>
            </div>

            {/* Heister count with 6-7 players */}
            <div className="rules-card">
              <div className="rules-card-header">
                <span className="rules-card-label">Heisters (6–7 Players)</span>
                <span className="rules-card-badge subtle">
                  {settings.heisterCount === 'auto' ? '2 Heisters' : '1 Heister'}
                </span>
              </div>
              <p className="rules-card-desc">
                {heisterCountNote ??
                  (settings.heisterCount === 'auto'
                    ? 'Default balance: 2 Heisters work in tandem against the police team.'
                    : 'Solo challenge: Only 1 Heister faces the larger police force.')}
              </p>
              <div className="rules-segmented" role="radiogroup" aria-label="Heisters with 6-7 players">
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.heisterCount === 'auto'}
                  className={`rules-segmented-btn ${settings.heisterCount === 'auto' ? 'active' : ''}`}
                  disabled={heisterCountDisabled}
                  onClick={() => onChange({ heisterCount: 'auto' })}
                >
                  2 Heisters (Auto)
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.heisterCount === 1}
                  className={`rules-segmented-btn ${settings.heisterCount === 1 ? 'active' : ''}`}
                  disabled={heisterCountDisabled}
                  onClick={() => onChange({ heisterCount: 1 })}
                >
                  1 Heister
                </button>
              </div>
            </div>

            {/* Direct Messages */}
            {showDMs && (
              <div className="rules-card">
                <div className="rules-toggle-row">
                  <div>
                    <div className="rules-card-label">Secret Direct Messages</div>
                    <p className="rules-card-desc">
                      Allow private whispering between players in chat during the match.
                    </p>
                  </div>
                  <label className="rules-switch">
                    <input
                      type="checkbox"
                      checked={settings.allowDMs}
                      onChange={(e) => onChange({ allowDMs: e.target.checked })}
                      aria-label="Allow secret direct messages"
                    />
                    <span className="rules-switch-track">
                      <span className="rules-switch-thumb" />
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </details>

      {extraFooter}
    </div>
  );
}
