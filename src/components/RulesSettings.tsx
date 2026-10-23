import { useState } from 'react';
import { escapeTarget } from '../../shared/engine';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';
import './RulesSettings.css';

interface Preset {
  id: string;
  name: string;
  desc: string;
  settings: Partial<Settings>;
}

export const RULE_PRESETS: Preset[] = [
  {
    id: 'standard',
    name: 'Standard',
    desc: 'Balanced official rules: 15 rounds, 45–60s timers, 10 artifacts',
    settings: {
      maxRounds: 15,
      heisterSeconds: 60,
      policeSeconds: 45,
      infoSeconds: 60,
      setupSeconds: 60,
      artifactCount: 10,
      searchRange: 1,
      heisterCount: 'auto',
    },
  },
  {
    id: 'blitz',
    name: 'Blitz',
    desc: 'Fast & intense: 10 rounds, 30s timers, 8 artifacts',
    settings: {
      maxRounds: 10,
      heisterSeconds: 45,
      policeSeconds: 30,
      infoSeconds: 30,
      setupSeconds: 45,
      artifactCount: 8,
      searchRange: 1,
      heisterCount: 'auto',
    },
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    desc: 'Generous time for beginners: 20 rounds, 60–90s timers, 12 artifacts',
    settings: {
      maxRounds: 20,
      heisterSeconds: 90,
      policeSeconds: 60,
      infoSeconds: 90,
      setupSeconds: 90,
      artifactCount: 12,
      searchRange: 1,
      heisterCount: 'auto',
    },
  },
];

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
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

  const timerChips = [30, 45, 60, 90];

  const searchOptions = [
    { value: 0, label: '0 stops', hint: 'Officers only sweep the station they occupy' },
    { value: 1, label: '1 stop', hint: 'Standard: Officers sweep their station and adjacent stops' },
    { value: 2, label: '2 stops', hint: 'Wide sweep: Officers search stations up to 2 stops away' },
    { value: 3, label: '3 stops', hint: 'Broad grid: Officers search stations up to 3 stops away' },
  ];

  const showObjectives = tab === 'all' || tab === 'objectives';
  const showTimers = tab === 'all' || tab === 'timers';
  const showOptions = tab === 'all' || tab === 'options';

  return (
    <div className="rules-container">
      <div className="rules-head">
        <h3>
          Rules
          {isHost ? (
            <span className="rules-head-badge host">Host editable</span>
          ) : (
            <span className="rules-head-badge">Host sets these</span>
          )}
        </h3>

        {!isDefault && isHost && (
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

      {/* Presets Bar */}
      <div className="rules-presets-row">
        <span className="rules-presets-label">Presets</span>
        {RULE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`rules-preset-chip ${activePreset === p.id ? 'active' : ''}`}
            disabled={!isHost}
            onClick={() => applyPreset(p)}
            title={p.desc}
          >
            {p.name}
          </button>
        ))}
      </div>

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
              disabled={!isHost}
              onChange={(val) => onChange({ maxRounds: val })}
              ariaLabel="Game rounds"
            />
          </div>

          {/* Artifacts Hidden */}
          <div className="rules-card">
            <div className="rules-card-header">
              <span className="rules-card-label">Artifacts Hidden</span>
              <span className="rules-card-badge">Escape needs {escapeTarget(settings)}</span>
            </div>
            <p className="rules-card-desc">
              Total loot pieces on the board. A Heister escapes by bringing {escapeTarget(settings)}{' '}
              (half, rounded up) to an exit.
            </p>
            <NumberStepper
              value={settings.artifactCount}
              min={1}
              max={30}
              step={1}
              suffix="loot"
              disabled={!isHost}
              onChange={(val) => onChange({ artifactCount: val })}
              ariaLabel="Artifacts hidden"
            />
          </div>

          {/* Search Range */}
          <div className="rules-card">
            <div className="rules-card-header">
              <span className="rules-card-label">Police Search Range</span>
              <span className="rules-card-badge subtle">{settings.searchRange} stop{settings.searchRange === 1 ? '' : 's'}</span>
            </div>
            <p className="rules-card-desc">
              {searchOptions.find((o) => o.value === settings.searchRange)?.hint}
            </p>
            <div className="rules-segmented" role="radiogroup" aria-label="Police Search Range">
              {searchOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.searchRange === opt.value}
                  className={`rules-segmented-btn ${settings.searchRange === opt.value ? 'active' : ''}`}
                  disabled={!isHost}
                  onClick={() => onChange({ searchRange: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
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
                disabled={!isHost}
                onChange={(val) => onChange({ heisterSeconds: val })}
                ariaLabel="Heister Phase duration in seconds"
              />
              <div className="rules-quick-chips">
                {timerChips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rules-chip ${settings.heisterSeconds === s ? 'active' : ''}`}
                    disabled={!isHost}
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
                disabled={!isHost}
                onChange={(val) => onChange({ policeSeconds: val })}
                ariaLabel="Police turn duration in seconds"
              />
              <div className="rules-quick-chips">
                {timerChips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rules-chip ${settings.policeSeconds === s ? 'active' : ''}`}
                    disabled={!isHost}
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
                disabled={!isHost}
                onChange={(val) => onChange({ infoSeconds: val })}
                ariaLabel="Information Phase duration in seconds"
              />
              <div className="rules-quick-chips">
                {timerChips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rules-chip ${settings.infoSeconds === s ? 'active' : ''}`}
                    disabled={!isHost}
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
                disabled={!isHost}
                onChange={(val) => onChange({ setupSeconds: val })}
                ariaLabel="Setup duration in seconds"
              />
              <div className="rules-quick-chips">
                {timerChips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rules-chip ${settings.setupSeconds === s ? 'active' : ''}`}
                    disabled={!isHost}
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
                disabled={!isHost || heisterCountDisabled}
                onClick={() => onChange({ heisterCount: 'auto' })}
              >
                2 Heisters (Auto)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={settings.heisterCount === 1}
                className={`rules-segmented-btn ${settings.heisterCount === 1 ? 'active' : ''}`}
                disabled={!isHost || heisterCountDisabled}
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
                <label className={`rules-switch ${!isHost ? 'disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={settings.allowDMs}
                    disabled={!isHost}
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

      {extraFooter}
    </div>
  );
}
