const BB_ATTRIBUTES = [
  "combat",
  "firearms",
  "nerve",
  "bullshit",
  "hunch",
  "photography",
  "chemicals"
];

const BB_ATTRIBUTE_LABELS = {
  combat: "COMBAT",
  firearms: "FIREARMS",
  nerve: "NERVE",
  bullshit: "BULLSHIT",
  hunch: "HUNCH",
  photography: "PHOTOGRAPHY",
  chemicals: "CHEMICALS"
};

const BB_DRUGS = {
  A: {
    name: "The Cure For Sleep",
    modifiers: { combat: 1, firearms: 1, nerve: 1, hunch: -1, bullshit: -1 }
  },
  B: {
    name: "Business Powder",
    modifiers: { bullshit: 1, nerve: -1, hunch: -1 }
  },
  C: {
    name: "Fluffy Blanket",
    modifiers: { nerve: 2, combat: -1, firearms: -1, hunch: -1, bullshit: -1 }
  },
  D: {
    name: "Psykafungoid",
    modifiers: { hunch: 1, photography: -1, firearms: -1, combat: -1, nerve: -1, chemicals: -1 }
  },
  E: {
    name: "Brown Liquor",
    modifiers: { nerve: 1, combat: -1, firearms: -1 }
  },
  F: {
    name: "Shamanistic Leaf",
    modifiers: { photography: 1, bullshit: -1, combat: -1, nerve: -1 }
  },
  G: {
    name: "Cerebral Transmutation Agent",
    modifiers: { chemicals: 1, bullshit: -1, nerve: -1, combat: -1, firearms: -1, photography: -1, hunch: -1 }
  }
};

function getPropertySafe(object, path, fallback = undefined) {
  if (typeof foundry?.utils?.getProperty === "function") return foundry.utils.getProperty(object, path) ?? fallback;
  return path.split(".").reduce((o, key) => (o ? o[key] : undefined), object) ?? fallback;
}

function normaliseDrugEquation(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-G]/g, "");
}

function calculateDrugTotals(drugEquation) {
  const equation = normaliseDrugEquation(drugEquation);
  const totals = Object.fromEntries(BB_ATTRIBUTES.map(attribute => [attribute, 0]));
  const counts = Object.fromEntries(Object.keys(BB_DRUGS).map(letter => [letter, 0]));

  for (const letter of equation) {
    const drug = BB_DRUGS[letter];
    if (!drug) continue;
    counts[letter] += 1;
    for (const [attribute, modifier] of Object.entries(drug.modifiers)) {
      totals[attribute] += modifier;
    }
  }

  return { equation, totals, counts };
}

function getOutcome(total) {
  if (total <= 3) return "DISASTER";
  if (total <= 7) return "MIDDLING";
  if (total <= 9) return "SUCCESS";
  return "OVERKILL";
}

function signed(number) {
  const n = Number(number || 0);
  return n >= 0 ? `+${n}` : `${n}`;
}

class BloodBullionOperatorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["blood-bullion", "sheet", "actor", "operator"],
      template: "systems/blood-bullion/templates/operator-sheet.html",
      width: 760,
      height: 820,
      resizable: true,
      tabs: []
    });
  }

  getData(options = {}) {
    const context = super.getData(options);
    const system = context.actor.system ?? {};
    context.system = system;
    const drugData = calculateDrugTotals(system.drugEquation ?? "");

    context.config = {
      attributes: BB_ATTRIBUTES.map(key => ({
        key,
        label: BB_ATTRIBUTE_LABELS[key],
        base: Number(getPropertySafe(system, `attributes.${key}`, 0)),
        drug: drugData.totals[key] ?? 0,
        total: Number(getPropertySafe(system, `attributes.${key}`, 0)) + Number(drugData.totals[key] ?? 0),
        net: signed(Number(getPropertySafe(system, `attributes.${key}`, 0)) + Number(drugData.totals[key] ?? 0))
      })),
      drugs: Object.entries(BB_DRUGS).map(([letter, drug]) => ({
        letter,
        name: drug.name,
        count: drugData.counts[letter] ?? 0
      })),
      drugTotals: BB_ATTRIBUTES.map(key => ({
        key,
        label: BB_ATTRIBUTE_LABELS[key],
        total: drugData.totals[key] ?? 0,
        signedTotal: signed(drugData.totals[key] ?? 0)
      })),
      cleanDrugEquation: drugData.equation
    };

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find(".bb-roll").click(this._onRollAttribute.bind(this));
    html.find(".bb-add-drug").click(this._onAddDrug.bind(this));
    html.find(".bb-remove-drug").click(this._onRemoveDrug.bind(this));
    html.find(".bb-clean-equation").click(this._onCleanEquation.bind(this));
    html.find(".bb-drug-equation").change(this._onDrugEquationChange.bind(this));
    html.find("textarea[name^='system.'], input[name^='system.']").not(".bb-drug-equation").change(this._onSystemFieldChange.bind(this));
  }

  async _onRollAttribute(event) {
    event.preventDefault();
    const attribute = event.currentTarget.dataset.attribute;
    const system = this.actor.system ?? {};
    const base = Number(getPropertySafe(system, `attributes.${attribute}`, 0));
    const drugData = calculateDrugTotals(system.drugEquation ?? "");
    const drugMod = Number(drugData.totals[attribute] ?? 0);
    const totalMod = base + drugMod;

    const roll = new Roll(`1d10 + ${totalMod}`);
    await roll.evaluate({ async: true });

    const total = roll.total;
    const outcome = getOutcome(total);
    const label = BB_ATTRIBUTE_LABELS[attribute] ?? attribute.toUpperCase();

    const content = `
      <div class="bb-chat-card">
        <h2>${label} TEST</h2>
        <div class="bb-chat-outcome">${outcome}</div>
        <table>
          <tr><td>Base Attribute</td><td>${signed(base)}</td></tr>
          <tr><td>Drug Equation</td><td>${drugData.equation || "—"}</td></tr>
          <tr><td>Drug Modifier</td><td>${signed(drugMod)}</td></tr>
          <tr><td>Total Modifier</td><td>${signed(totalMod)}</td></tr>
          <tr><td>Final Total</td><td>${total}</td></tr>
        </table>
      </div>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: content
    });
  }

  async _onAddDrug(event) {
    event.preventDefault();
    const letter = event.currentTarget.dataset.letter;
    const current = this.actor.system.drugEquation ?? "";
    await this.actor.update({ "system.drugEquation": normaliseDrugEquation(current + letter) });
  }

  async _onRemoveDrug(event) {
    event.preventDefault();
    const letter = event.currentTarget.dataset.letter;
    const current = normaliseDrugEquation(this.actor.system.drugEquation ?? "");
    const index = current.lastIndexOf(letter);
    if (index < 0) return;
    const next = current.slice(0, index) + current.slice(index + 1);
    await this.actor.update({ "system.drugEquation": next });
  }

  async _onDrugEquationChange(event) {
    event.preventDefault();
    const value = normaliseDrugEquation(event.currentTarget.value);
    event.currentTarget.value = value;
    await this.actor.update({ "system.drugEquation": value });
  }

  async _onSystemFieldChange(event) {
    const field = event.currentTarget.name;
    if (!field || field === "system.drugEquation") return;
    let value = event.currentTarget.value;
    if (event.currentTarget.dataset.dtype === "Number") value = Number(value || 0);
    await this.actor.update({ [field]: value });
  }

  async _onCleanEquation(event) {
    event.preventDefault();
    event.stopPropagation();

    // CLEAN means purge all active drug doses. No parsing, no normalising, no cleverness.
    const input = event.currentTarget
      .closest(".bb-drug-equation-box")
      ?.querySelector(".bb-drug-equation");

    if (input) input.value = "";
    await this.actor.update({ "system.drugEquation": "" });
    this.render(false);
  }
}

Hooks.once("init", async function () {
  console.log("Blood Bullion | Initialising minimal v13 system");

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("blood-bullion", BloodBullionOperatorSheet, {
    types: ["operator"],
    makeDefault: true
  });
});

Hooks.once("ready", function () {
  game.bloodBullion = {
    attributes: BB_ATTRIBUTES,
    attributeLabels: BB_ATTRIBUTE_LABELS,
    drugs: BB_DRUGS,
    calculateDrugTotals,
    getOutcome
  };
});
