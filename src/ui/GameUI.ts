export type GraphicsPreset = "low" | "balanced" | "cinematic";

interface MenuActions {
  onStart: () => void;
  onGraphics: (preset: GraphicsPreset) => void;
}

interface PauseActions extends MenuActions {
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
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
          <button id="show-settings" class="quiet-action">Settings</button>
          <button id="show-controls" class="quiet-action">Controls</button>
        </div>
        <section id="settings-panel" class="menu-panel" hidden>
          <p class="panel-label">Graphics</p>
          <div class="preset-row">
            <button data-preset="low" class="preset-button">Low</button>
            <button data-preset="balanced" class="preset-button is-active">Balanced</button>
            <button data-preset="cinematic" class="preset-button">Cinematic</button>
          </div>
        </section>
        <section id="controls-panel" class="menu-panel controls" hidden>
          <span><b>WASD</b> Move</span>
          <span><b>Space</b> Jump</span>
          <span><b>Mouse</b> Look</span>
          <span><b>Left click</b> Fire</span>
          <span><b>R</b> Reload</span>
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
          <button id="pause-settings" class="quiet-action">Settings</button>
          <button id="pause-controls" class="quiet-action">Controls</button>
          <button id="main-menu" class="text-action">Return to main menu</button>
        </div>
        <section id="settings-panel" class="menu-panel" hidden>
          <p class="panel-label">Graphics</p>
          <div class="preset-row">
            <button data-preset="low" class="preset-button">Low</button>
            <button data-preset="balanced" class="preset-button is-active">Balanced</button>
            <button data-preset="cinematic" class="preset-button">Cinematic</button>
          </div>
        </section>
        <section id="controls-panel" class="menu-panel controls" hidden>
          <span><b>WASD</b> Move</span><span><b>Space</b> Jump</span><span><b>Mouse</b> Look</span><span><b>Left click</b> Fire</span><span><b>R</b> Reload</span><span><b>Esc</b> Pause</span>
        </section>
      </main>`;
    document.querySelector("#resume-match")?.addEventListener("click", actions.onResume);
    document.querySelector("#restart-match")?.addEventListener("click", actions.onRestart);
    document.querySelector("#main-menu")?.addEventListener("click", actions.onMainMenu);
    this.bindPanelToggles("#pause-settings", "#pause-controls");
    this.bindGraphicsButtons(actions.onGraphics);
  }

  showHud() {
    this.root.innerHTML = `
      <div class="hud top"><div id="timer">05:00</div></div>
      <div class="crosshair" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div id="feedback"></div>
      <div class="hud bottom">
        <div class="hud-readout hud-health"><span>HEALTH</span><b id="health">100</b></div>
        <div class="hud-readout hud-bots"><span>HOSTILES</span><b id="bots-remaining">10</b></div>
        <div class="hud-readout hud-ammo"><span>AMMUNITION</span><b id="ammo">30 / ∞</b></div>
      </div>`;
  }

  update(values: { health: number; magazine: number; botsRemaining: number; remaining: number; message?: string }) {
    this.setText("health", String(Math.round(values.health)));
    this.setText("ammo", `${values.magazine} / ∞`);
    this.setText("bots-remaining", String(values.botsRemaining));
    const minutes = Math.floor(values.remaining / 60).toString().padStart(2, "0");
    const seconds = Math.ceil(values.remaining % 60).toString().padStart(2, "0");
    this.setText("timer", `${minutes}:${seconds}`);
    if (values.message !== undefined) this.setText("feedback", values.message);
  }

  showResult(result: "Victory" | "Defeat" | "Draw", onRestart: () => void) {
    this.root.innerHTML += `
      <main class="result">
        <p class="eyebrow">MISSION COMPLETE</p>
        <h2>${result}</h2>
        <p>${result === "Draw" ? "Time expired before the district was secured." : result === "Victory" ? "The district is secure." : "The security district has been lost."}</p>
        <button id="rematch" class="primary-action">Run it again</button>
      </main>`;
    document.querySelector("#rematch")?.addEventListener("click", onRestart);
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
    this.bindPanelToggles("#show-settings", "#show-controls");
    this.bindGraphicsButtons(actions.onGraphics);
  }

  private bindPanelToggles(settingsSelector: string, controlsSelector: string) {
    const settings = document.querySelector<HTMLElement>("#settings-panel");
    const controls = document.querySelector<HTMLElement>("#controls-panel");
    document.querySelector(settingsSelector)?.addEventListener("click", () => {
      if (!settings || !controls) return;
      settings.hidden = !settings.hidden;
      controls.hidden = true;
    });
    document.querySelector(controlsSelector)?.addEventListener("click", () => {
      if (!settings || !controls) return;
      controls.hidden = !controls.hidden;
      settings.hidden = true;
    });
  }

  private bindGraphicsButtons(onGraphics: (preset: GraphicsPreset) => void) {
    document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.dataset.preset as GraphicsPreset;
        onGraphics(preset);
        document.querySelectorAll("[data-preset]").forEach((option) => option.classList.remove("is-active"));
        button.classList.add("is-active");
      });
    });
  }

  private setText(id: string, value: string) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }
}
