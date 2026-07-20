interface MenuActions {
  onStart: () => void;
}

interface PauseActions {
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
}

export interface HudValues {
  wave: number;
  totalWaves?: number;
  health: number;
  maximumHealth: number;
  magazine: number;
  magazineSize: number;
  weaponName: string;
  enemiesAlive: number;
  enemiesRemaining: number;
  remaining: number;
  message?: string;
  announcement?: {
    title: string;
    detail: string;
  };
}

export interface GameResults {
  result: "Victory" | "Defeat";
  wavesCompleted: number;
  totalWaves: number;
  enemiesDefeated: number;
  completionSeconds: number;
  shotsFired: number;
  shotsHit: number;
  damageTaken: number;
}

interface ResultActions {
  onRestart: () => void;
  onMainMenu: () => void;
}

export interface ShopMenuRow {
  id: string;
  label: string;
  current: string;
  addition: string;
  selected?: boolean;
}

export interface ShopMenuData {
  title: string;
  summary: string;
  rows: ShopMenuRow[];
}

interface ShopActions {
  onPurchase: (id: string) => void;
  onClose: () => void;
}

interface GameplayTestReport {
  scenario: string;
  phase: string;
  wave: number;
  timer: number;
  alive: number;
  defeated: number;
  waitingToSpawn: number;
  remaining: number;
  health: number;
  magazine: number;
  totalEnemiesDefeated: number;
  wavesCompleted: number;
  maximumAliveByWave: number[];
  elevatedSpawnsByWave: number[];
  botActivity: string[];
}

export class GameUI {
  private readonly root = document.querySelector<HTMLDivElement>("#ui")!;

  showLoading(progress: number, status: string) {
    this.root.innerHTML = `
      <main class="loading-screen" aria-live="polite">
        <p class="eyebrow">BLACKSITE // RAINLINE</p>
        <h1>SECURITY DISTRICT</h1>
        <p class="loading-status">${status}</p>
        <div class="loading-track"><span style="width: ${Math.max(0, Math.min(progress, 100))}%"></span></div>
        <p class="loading-percent">${Math.round(progress)}%</p>
      </main>`;
  }

  showStart(actions: MenuActions) {
    this.root.innerHTML = `
      <main class="menu menu--main">
        <p class="eyebrow">COMPACT INDUSTRIAL COMBAT YARD</p>
        <h1>BLACKSITE<br><em>RAINLINE</em></h1>
        <p class="lede">Late afternoon. Light rain. One dense sixty-metre yard built around containers, a warehouse, rooftop routes, and an accessible guard tower.</p>
        <div class="menu-actions">
          <button id="start-match" class="primary-action">Start Mission</button>
          <button id="show-controls" class="quiet-action">Controls</button>
        </div>
        <section id="controls-panel" class="menu-panel controls" hidden>
          <span><b>WASD</b> Move</span>
          <span><b>Space</b> Jump</span>
          <span><b>Mouse</b> Look</span>
          <span><b>Left click</b> Fire</span>
          <span><b>Right click</b> Aim</span>
          <span><b>R</b> Reload</span>
          <span><b>V</b> Knife</span>
          <span><b>E</b> Use safe-zone shop</span>
          <span><b>Esc</b> Pause</span>
        </section>
        <p class="small">The mouse locks after the mission starts. Every elevated combat route has a grounded staircase or landing.</p>
      </main>`;
    this.bindStartActions(actions);
  }

  showPause(actions: PauseActions) {
    this.root.innerHTML = `
      <div class="pause-backdrop"></div>
      <main class="menu menu--pause">
        <p class="eyebrow">MISSION PAUSED</p>
        <h2>Hold position.</h2>
        <div class="pause-actions">
          <button id="resume-match" class="primary-action">Resume</button>
          <button id="restart-match" class="quiet-action">Restart</button>
          <button id="pause-controls" class="quiet-action">Controls</button>
          <button id="main-menu" class="text-action">Return to main menu</button>
        </div>
        <section id="controls-panel" class="menu-panel controls" hidden>
          <span><b>WASD</b> Move</span><span><b>Space</b> Jump</span><span><b>Mouse</b> Look</span><span><b>Left click</b> Fire</span><span><b>Right click</b> Aim</span><span><b>R</b> Reload</span><span><b>V</b> Knife</span><span><b>E</b> Use safe-zone shop</span><span><b>Esc</b> Pause</span>
        </section>
      </main>`;
    document.querySelector("#resume-match")?.addEventListener("click", actions.onResume);
    document.querySelector("#restart-match")?.addEventListener("click", actions.onRestart);
    document.querySelector("#main-menu")?.addEventListener("click", actions.onMainMenu);
    this.bindControlsToggle("#pause-controls");
  }

  showHud() {
    this.root.innerHTML = `
      <div class="hud top">
        <div id="wave">WAVE 1</div>
        <div id="timer">00:00</div>
      </div>
      <div class="crosshair" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="scope-overlay" aria-hidden="true">
        <div class="scope-lens">
          <span class="scope-line scope-line--horizontal"></span>
          <span class="scope-line scope-line--vertical"></span>
          <span class="scope-dot"></span>
        </div>
      </div>
      <div id="feedback"></div>
      <div id="shop-prompt" class="shop-prompt" hidden></div>
      <div id="wave-announcement" class="wave-announcement" hidden>
        <strong id="announcement-title"></strong>
        <span id="announcement-detail"></span>
      </div>
      <div class="hud bottom">
        <div class="hud-readout hud-health"><span>HEALTH</span><b id="health">100 / 100</b></div>
        <div class="hud-enemies">
          <div class="hud-readout hud-bots">
            <span>ALIVE</span>
            <b id="enemies-alive">0</b>
          </div>
          <div class="hud-readout hud-bots">
            <span>WAVE REMAINING</span>
            <b id="enemies-remaining">15</b>
          </div>
        </div>
        <div class="hud-readout hud-ammo"><span id="weapon-name">ASSAULT RIFLE</span><b id="ammo">40 / 40</b></div>
      </div>`;
  }

  setAiming(aiming: boolean) {
    this.root.classList.toggle("is-aiming", aiming);
  }

  setShopPrompt(message?: string) {
    const prompt = document.querySelector<HTMLElement>("#shop-prompt");
    if (!prompt) return;
    prompt.hidden = message === undefined;
    prompt.textContent = message ?? "";
  }

  showShop(data: ShopMenuData, actions: ShopActions) {
    this.hideShop();
    this.root.insertAdjacentHTML(
      "beforeend",
      `
        <div class="shop-backdrop" aria-hidden="true"></div>
        <section id="shop-menu" class="shop-menu" role="dialog" aria-modal="true" aria-labelledby="shop-title">
          <div class="shop-header">
            <div>
              <p class="eyebrow">SAFE-ZONE SUPPLY TERMINAL</p>
              <h2 id="shop-title">${data.title}</h2>
              <p>${data.summary}</p>
            </div>
            <button id="close-shop" class="shop-close" aria-label="Close shop">Close</button>
          </div>
          <p class="shop-free-notice">Development pricing: every purchase is free and repeatable.</p>
          <div class="shop-options">
            ${data.rows.map((row) => `
              <article class="shop-option${row.selected ? " is-selected" : ""}">
                <div>
                  <strong>${row.label}</strong>
                  <span>Current: ${row.current}</span>
                </div>
                <button data-shop-purchase="${row.id}">
                  ${row.selected ? "Selected" : `Free · ${row.addition}`}
                </button>
              </article>
            `).join("")}
          </div>
          <p class="shop-help">Press E or Escape to close. The shop closes automatically when you leave the safe zone.</p>
        </section>
      `,
    );
    document.querySelector("#close-shop")?.addEventListener(
      "click",
      actions.onClose,
    );
    document.querySelectorAll<HTMLElement>("[data-shop-purchase]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset.shopPurchase;
          if (id) actions.onPurchase(id);
        });
      });
  }

  hideShop() {
    document.querySelector("#shop-menu")?.remove();
    document.querySelector(".shop-backdrop")?.remove();
  }

  update(values: HudValues) {
    this.setText("wave", `WAVE ${values.wave}`);
    this.setText(
      "health",
      `${Math.round(values.health)} / ${Math.round(values.maximumHealth)}`,
    );
    this.setText(
      "ammo",
      `${values.magazine} / ${values.magazineSize}`,
    );
    this.setText("weapon-name", values.weaponName.toUpperCase());
    this.setText("enemies-alive", String(values.enemiesAlive));
    this.setText("enemies-remaining", String(values.enemiesRemaining));
    const totalSeconds = Math.ceil(values.remaining);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60)
      .toString()
      .padStart(2, "0");
    this.setText("timer", `${minutes}:${seconds}`);
    if (values.message !== undefined) this.setText("feedback", values.message);
    const announcement = document.querySelector<HTMLElement>(
      "#wave-announcement",
    );
    if (announcement) {
      announcement.hidden = !values.announcement;
    }
    if (values.announcement) {
      this.setText("announcement-title", values.announcement.title);
      this.setText("announcement-detail", values.announcement.detail);
    }
  }

  showResult(results: GameResults, actions: ResultActions) {
    const accuracy = results.shotsFired > 0
      ? `${Math.round(results.shotsHit / results.shotsFired * 100)}%`
      : "—";
    this.root.innerHTML = `
      <main class="result">
        <p class="eyebrow">${
          results.result === "Victory"
            ? "MISSION COMPLETE"
            : "MISSION FAILED"
        }</p>
        <h2>${results.result}</h2>
        <p>${
          results.result === "Victory"
            ? "All three waves eliminated. The district is secure."
            : "The security district has been lost."
        }</p>
        <dl class="result-stats">
          <div><dt>Waves completed</dt><dd>${results.wavesCompleted} / ${results.totalWaves}</dd></div>
          <div><dt>Enemies defeated</dt><dd>${results.enemiesDefeated}</dd></div>
          <div><dt>Completion time</dt><dd>${this.formatDuration(results.completionSeconds)}</dd></div>
          <div><dt>Accuracy</dt><dd>${accuracy}</dd></div>
          <div><dt>Damage taken</dt><dd>${Math.round(results.damageTaken)}</dd></div>
        </dl>
        <div class="result-actions">
          <button id="rematch" class="primary-action">Play Again</button>
          <button id="result-main-menu" class="quiet-action">Return to Menu</button>
        </div>
      </main>`;
    document.querySelector("#rematch")?.addEventListener(
      "click",
      actions.onRestart,
    );
    document.querySelector("#result-main-menu")?.addEventListener(
      "click",
      actions.onMainMenu,
    );
  }

  showGameplayTestReport(values: GameplayTestReport) {
    let report = document.querySelector<HTMLElement>(
      "#gameplay-test-report",
    );
    if (!report) {
      this.root.insertAdjacentHTML(
        "beforeend",
        `
          <aside id="gameplay-test-report" class="gameplay-test-report">
            <b>GAMEPLAY TEST</b>
            <span id="test-scenario"></span>
            <span id="test-phase"></span>
            <span id="test-wave"></span>
            <span id="test-counts"></span>
            <span id="test-player"></span>
            <span id="test-run"></span>
            <span id="test-caps"></span>
            <span id="test-elevation"></span>
            <span id="test-bot-activity"></span>
          </aside>
        `,
      );
      report = document.querySelector<HTMLElement>(
        "#gameplay-test-report",
      );
    }
    if (!report) return;
    this.setText("test-scenario", `Scenario: ${values.scenario}`);
    this.setText("test-phase", `Phase: ${values.phase}`);
    this.setText(
      "test-wave",
      `Wave: ${values.wave} · Timer: ${values.timer.toFixed(1)}`,
    );
    this.setText(
      "test-counts",
      `Alive: ${values.alive} · Defeated: ${values.defeated} · Waiting: ${values.waitingToSpawn} · Remaining: ${values.remaining}`,
    );
    this.setText(
      "test-player",
      `Health: ${Math.round(values.health)} · Magazine: ${values.magazine}`,
    );
    this.setText(
      "test-run",
      `Run defeats: ${values.totalEnemiesDefeated} · Waves complete: ${values.wavesCompleted}`,
    );
    this.setText(
      "test-caps",
      `Maximum alive: ${values.maximumAliveByWave.join(" / ")}`,
    );
    this.setText(
      "test-elevation",
      `Elevated spawns: ${values.elevatedSpawnsByWave.join(" / ")}`,
    );
    this.setText(
      "test-bot-activity",
      values.botActivity.join(" | ") || "Bots: none",
    );
  }

  showCollisionDebug(values: {
    enabledColliders: number;
    blockingObject: string;
    position: string;
    colliderType: string;
    visibleMesh: string;
  }) {
    let panel = document.querySelector<HTMLElement>("#collision-debug");
    if (!panel) {
      this.root.insertAdjacentHTML("beforeend", '<aside id="collision-debug" class="collision-debug"></aside>');
      panel = document.querySelector<HTMLElement>("#collision-debug");
    }
    if (!panel) return;
    panel.innerHTML = `
      <b>COLLISION DEBUG</b>
      <span>Enabled colliders: ${values.enabledColliders}</span>
      <span>Blocking object: ${values.blockingObject}</span>
      <span>Position: ${values.position}</span>
      <span>Collider type: ${values.colliderType}</span>
      <span>Visible mesh: ${values.visibleMesh}</span>`;
  }

  hideCollisionDebug() {
    document.querySelector("#collision-debug")?.remove();
  }

  showMovementContactDebug(values: {
    actualDistance: string;
    actualHeading: string;
    actualSpeed: string;
    boundaryStatus: string;
    blockingColliderType: string;
    blockingMesh: string;
    blockingParent: string;
    blockerVisible: string;
    colliderSize: string;
    contactNormal: string;
    contactPoint: string;
    deflection: string;
    diagnosticMessage: string;
    groundMesh: string;
    groundNormal: string;
    grounded: string;
    playerCollider: string;
    playerPosition: string;
    playerPositionBefore: string;
    requestedDistance: string;
    requestedHeading: string;
    requestedSpeed: string;
    result: string;
    visibleColliderGap: string;
    visibleObjectSize: string;
    velocityAfter: string;
    velocityBefore: string;
  }) {
    let panel = document.querySelector<HTMLElement>("#movement-contact-debug");
    if (!panel) {
      this.root.insertAdjacentHTML("beforeend", '<aside id="movement-contact-debug" class="movement-contact-debug"></aside>');
      panel = document.querySelector<HTMLElement>("#movement-contact-debug");
    }
    if (!panel) return;
    const alert = values.result;
    panel.innerHTML = `
      <b>F7 ACTIVE CONTACT</b>
      <strong class="contact-result contact-result--${values.result.toLowerCase().replaceAll(" ", "-")}">${alert}</strong>
      <span>Requested: ${values.requestedHeading} @ ${values.requestedSpeed}</span>
      <span>Actual: ${values.actualHeading} @ ${values.actualSpeed}</span>
      <span>Distance: ${values.requestedDistance} requested / ${values.actualDistance} resolved</span>
      <span>Deflection: ${values.deflection}</span>
      <span>Position before: ${values.playerPositionBefore}</span>
      <span>Player: ${values.playerPosition}</span>
      <span>Collider: ${values.playerCollider}</span>
      <span>Grounded: ${values.grounded}</span>
      <span>Ground mesh: ${values.groundMesh}</span>
      <span>Ground normal: ${values.groundNormal}</span>
      <span>Blocking mesh: ${values.blockingMesh}</span>
      <span>Parent: ${values.blockingParent}</span>
      <span>Collider type: ${values.blockingColliderType}</span>
      <span>Visible/enabled: ${values.blockerVisible}</span>
      <span>Blocker size: ${values.colliderSize}</span>
      <span>Visible object size: ${values.visibleObjectSize}</span>
      <span>Collider gap: ${values.visibleColliderGap}</span>
      <span>Contact: ${values.contactPoint}</span>
      <span>Normal: ${values.contactNormal}</span>
      <span>Diagnostic: ${values.diagnosticMessage}</span>
      <span>Boundary clamp: ${values.boundaryStatus}</span>
      <span>Velocity before: ${values.velocityBefore}</span>
      <span>Velocity after: ${values.velocityAfter}</span>`;
  }

  hideMovementContactDebug() {
    document.querySelector("#movement-contact-debug")?.remove();
  }

  private bindStartActions(actions: MenuActions) {
    document.querySelector("#start-match")?.addEventListener("click", actions.onStart);
    this.bindControlsToggle("#show-controls");
  }

  private bindControlsToggle(controlsSelector: string) {
    const controls = document.querySelector<HTMLElement>("#controls-panel");
    document.querySelector(controlsSelector)?.addEventListener("click", () => {
      if (!controls) return;
      controls.hidden = !controls.hidden;
    });
  }

  private setText(id: string, value: string) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  private formatDuration(totalSeconds: number) {
    const wholeSeconds = Math.floor(totalSeconds);
    const minutes = Math.floor(wholeSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (wholeSeconds % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
}
