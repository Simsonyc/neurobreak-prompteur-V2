// /ui/director-mode.js
// IA-DIRECTOR — UI PURE
// Export STRICT conforme : createDirectorMode

export function createDirectorMode(rootElement, dispatch) {
  // ================================================================
  // CONTAINER PRINCIPAL
  // ================================================================

  const screen = document.createElement("div");
  screen.className = "director-screen";

  // Style local uniquement (aucun accès global)
  screen.style.position = "absolute";
  screen.style.inset = "0";
  screen.style.background = "#0a0a0a";
  screen.style.display = "none";
  screen.style.flexDirection = "column";
  screen.style.justifyContent = "center";
  screen.style.alignItems = "center";
  screen.style.gap = "16px";
  screen.style.padding = "24px";
  screen.style.boxSizing = "border-box";

  // ================================================================
  // HELPER CREATION BOUTON
  // ================================================================

  function createButton(label, className, eventType) {
    const btn = document.createElement("button");
    btn.className = `director-btn ${className}`;
    btn.textContent = label;

    // Style bouton (local)
    btn.style.width = "100%";
    btn.style.maxWidth = "420px";
    btn.style.padding = "18px 20px";
    btn.style.fontSize = "18px";
    btn.style.fontWeight = "600";
    btn.style.borderRadius = "12px";
    btn.style.border = "1px solid rgba(255,255,255,0.08)";
    btn.style.background = "#151515";
    btn.style.color = "#ffffff";
    btn.style.cursor = "pointer";
    btn.style.touchAction = "manipulation";

    btn.addEventListener("click", () => {
      if (typeof dispatch === "function") {
        dispatch({ type: eventType });
      }
    });

    return btn;
  }

  // ================================================================
  // BOUTONS DIRECTOR
  // ================================================================

  const btnStudio = createButton(
    "STUDIO",
    "studio",
    "EV_SELECT_MODE_STUDIO"
  );

  const btnSelfie = createButton(
    "SELFIE",
    "selfie",
    "EV_SELECT_MODE_SELFIE"
  );

  const btnCinematic = createButton(
    "CINEMATIC",
    "cinematic",
    "EV_SELECT_MODE_CINEMATIC"
  );

  const btnAdvanced = createButton(
    "AVANCÉ",
    "advanced",
    "EV_OPEN_ADVANCED"
  );

  screen.appendChild(btnStudio);
  screen.appendChild(btnSelfie);
  screen.appendChild(btnCinematic);
  screen.appendChild(btnAdvanced);

  // ================================================================
  // MOUNT DANS rootElement UNIQUEMENT
  // ================================================================

  rootElement.appendChild(screen);

  // ================================================================
  // UPDATE (VISIBILITÉ)
  // ================================================================

  function update(renderState) {
    if (!renderState) return;

    screen.style.display = "none";
  }

  // ================================================================
  // API PUBLIQUE
  // ================================================================

  return {
    update
  };
}

