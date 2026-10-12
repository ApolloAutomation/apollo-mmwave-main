/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a;
const t$1 = globalThis, e$2 = t$1.ShadowRoot && (void 0 === t$1.ShadyCSS || t$1.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$2 = Symbol(), o$4 = /* @__PURE__ */ new WeakMap();
let n$3 = class n {
  constructor(t2, e2, o2) {
    if (this._$cssResult$ = true, o2 !== s$2) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t2, this.t = e2;
  }
  get styleSheet() {
    let t2 = this.o;
    const s2 = this.t;
    if (e$2 && void 0 === t2) {
      const e2 = void 0 !== s2 && 1 === s2.length;
      e2 && (t2 = o$4.get(s2)), void 0 === t2 && ((this.o = t2 = new CSSStyleSheet()).replaceSync(this.cssText), e2 && o$4.set(s2, t2));
    }
    return t2;
  }
  toString() {
    return this.cssText;
  }
};
const r$4 = (t2) => new n$3("string" == typeof t2 ? t2 : t2 + "", void 0, s$2), i$3 = (t2, ...e2) => {
  const o2 = 1 === t2.length ? t2[0] : e2.reduce((e3, s2, o3) => e3 + ((t3) => {
    if (true === t3._$cssResult$) return t3.cssText;
    if ("number" == typeof t3) return t3;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t3 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s2) + t2[o3 + 1], t2[0]);
  return new n$3(o2, t2, s$2);
}, S$2 = (s2, o2) => {
  if (e$2) s2.adoptedStyleSheets = o2.map((t2) => t2 instanceof CSSStyleSheet ? t2 : t2.styleSheet);
  else for (const e2 of o2) {
    const o3 = document.createElement("style"), n3 = t$1.litNonce;
    void 0 !== n3 && o3.setAttribute("nonce", n3), o3.textContent = e2.cssText, s2.appendChild(o3);
  }
}, c$2 = e$2 ? (t2) => t2 : (t2) => t2 instanceof CSSStyleSheet ? ((t3) => {
  let e2 = "";
  for (const s2 of t3.cssRules) e2 += s2.cssText;
  return r$4(e2);
})(t2) : t2;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: i$2, defineProperty: e$1, getOwnPropertyDescriptor: h$1, getOwnPropertyNames: r$3, getOwnPropertySymbols: o$3, getPrototypeOf: n$2 } = Object, a$1 = globalThis, c$1 = a$1.trustedTypes, l$1 = c$1 ? c$1.emptyScript : "", p$1 = a$1.reactiveElementPolyfillSupport, d$1 = (t2, s2) => t2, u$1 = { toAttribute(t2, s2) {
  switch (s2) {
    case Boolean:
      t2 = t2 ? l$1 : null;
      break;
    case Object:
    case Array:
      t2 = null == t2 ? t2 : JSON.stringify(t2);
  }
  return t2;
}, fromAttribute(t2, s2) {
  let i2 = t2;
  switch (s2) {
    case Boolean:
      i2 = null !== t2;
      break;
    case Number:
      i2 = null === t2 ? null : Number(t2);
      break;
    case Object:
    case Array:
      try {
        i2 = JSON.parse(t2);
      } catch (t3) {
        i2 = null;
      }
  }
  return i2;
} }, f$1 = (t2, s2) => !i$2(t2, s2), b$1 = { attribute: true, type: String, converter: u$1, reflect: false, useDefault: false, hasChanged: f$1 };
Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), a$1.litPropertyMetadata ?? (a$1.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
let y$1 = class y extends HTMLElement {
  static addInitializer(t2) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t2);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t2, s2 = b$1) {
    if (s2.state && (s2.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t2) && ((s2 = Object.create(s2)).wrapped = true), this.elementProperties.set(t2, s2), !s2.noAccessor) {
      const i2 = Symbol(), h2 = this.getPropertyDescriptor(t2, i2, s2);
      void 0 !== h2 && e$1(this.prototype, t2, h2);
    }
  }
  static getPropertyDescriptor(t2, s2, i2) {
    const { get: e2, set: r2 } = h$1(this.prototype, t2) ?? { get() {
      return this[s2];
    }, set(t3) {
      this[s2] = t3;
    } };
    return { get: e2, set(s3) {
      const h2 = e2 == null ? void 0 : e2.call(this);
      r2 == null ? void 0 : r2.call(this, s3), this.requestUpdate(t2, h2, i2);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t2) {
    return this.elementProperties.get(t2) ?? b$1;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d$1("elementProperties"))) return;
    const t2 = n$2(this);
    t2.finalize(), void 0 !== t2.l && (this.l = [...t2.l]), this.elementProperties = new Map(t2.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d$1("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d$1("properties"))) {
      const t3 = this.properties, s2 = [...r$3(t3), ...o$3(t3)];
      for (const i2 of s2) this.createProperty(i2, t3[i2]);
    }
    const t2 = this[Symbol.metadata];
    if (null !== t2) {
      const s2 = litPropertyMetadata.get(t2);
      if (void 0 !== s2) for (const [t3, i2] of s2) this.elementProperties.set(t3, i2);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t3, s2] of this.elementProperties) {
      const i2 = this._$Eu(t3, s2);
      void 0 !== i2 && this._$Eh.set(i2, t3);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s2) {
    const i2 = [];
    if (Array.isArray(s2)) {
      const e2 = new Set(s2.flat(1 / 0).reverse());
      for (const s3 of e2) i2.unshift(c$2(s3));
    } else void 0 !== s2 && i2.push(c$2(s2));
    return i2;
  }
  static _$Eu(t2, s2) {
    const i2 = s2.attribute;
    return false === i2 ? void 0 : "string" == typeof i2 ? i2 : "string" == typeof t2 ? t2.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    var _a2;
    this._$ES = new Promise((t2) => this.enableUpdating = t2), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), (_a2 = this.constructor.l) == null ? void 0 : _a2.forEach((t2) => t2(this));
  }
  addController(t2) {
    var _a2;
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t2), void 0 !== this.renderRoot && this.isConnected && ((_a2 = t2.hostConnected) == null ? void 0 : _a2.call(t2));
  }
  removeController(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.delete(t2);
  }
  _$E_() {
    const t2 = /* @__PURE__ */ new Map(), s2 = this.constructor.elementProperties;
    for (const i2 of s2.keys()) this.hasOwnProperty(i2) && (t2.set(i2, this[i2]), delete this[i2]);
    t2.size > 0 && (this._$Ep = t2);
  }
  createRenderRoot() {
    const t2 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S$2(t2, this.constructor.elementStyles), t2;
  }
  connectedCallback() {
    var _a2;
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostConnected) == null ? void 0 : _a3.call(t2);
    });
  }
  enableUpdating(t2) {
  }
  disconnectedCallback() {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostDisconnected) == null ? void 0 : _a3.call(t2);
    });
  }
  attributeChangedCallback(t2, s2, i2) {
    this._$AK(t2, i2);
  }
  _$ET(t2, s2) {
    var _a2;
    const i2 = this.constructor.elementProperties.get(t2), e2 = this.constructor._$Eu(t2, i2);
    if (void 0 !== e2 && true === i2.reflect) {
      const h2 = (void 0 !== ((_a2 = i2.converter) == null ? void 0 : _a2.toAttribute) ? i2.converter : u$1).toAttribute(s2, i2.type);
      this._$Em = t2, null == h2 ? this.removeAttribute(e2) : this.setAttribute(e2, h2), this._$Em = null;
    }
  }
  _$AK(t2, s2) {
    var _a2, _b;
    const i2 = this.constructor, e2 = i2._$Eh.get(t2);
    if (void 0 !== e2 && this._$Em !== e2) {
      const t3 = i2.getPropertyOptions(e2), h2 = "function" == typeof t3.converter ? { fromAttribute: t3.converter } : void 0 !== ((_a2 = t3.converter) == null ? void 0 : _a2.fromAttribute) ? t3.converter : u$1;
      this._$Em = e2;
      const r2 = h2.fromAttribute(s2, t3.type);
      this[e2] = r2 ?? ((_b = this._$Ej) == null ? void 0 : _b.get(e2)) ?? r2, this._$Em = null;
    }
  }
  requestUpdate(t2, s2, i2, e2 = false, h2) {
    var _a2;
    if (void 0 !== t2) {
      const r2 = this.constructor;
      if (false === e2 && (h2 = this[t2]), i2 ?? (i2 = r2.getPropertyOptions(t2)), !((i2.hasChanged ?? f$1)(h2, s2) || i2.useDefault && i2.reflect && h2 === ((_a2 = this._$Ej) == null ? void 0 : _a2.get(t2)) && !this.hasAttribute(r2._$Eu(t2, i2)))) return;
      this.C(t2, s2, i2);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t2, s2, { useDefault: i2, reflect: e2, wrapped: h2 }, r2) {
    i2 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t2) && (this._$Ej.set(t2, r2 ?? s2 ?? this[t2]), true !== h2 || void 0 !== r2) || (this._$AL.has(t2) || (this.hasUpdated || i2 || (s2 = void 0), this._$AL.set(t2, s2)), true === e2 && this._$Em !== t2 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t2));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t3) {
      Promise.reject(t3);
    }
    const t2 = this.scheduleUpdate();
    return null != t2 && await t2, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    var _a2;
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t4, s3] of this._$Ep) this[t4] = s3;
        this._$Ep = void 0;
      }
      const t3 = this.constructor.elementProperties;
      if (t3.size > 0) for (const [s3, i2] of t3) {
        const { wrapped: t4 } = i2, e2 = this[s3];
        true !== t4 || this._$AL.has(s3) || void 0 === e2 || this.C(s3, void 0, i2, e2);
      }
    }
    let t2 = false;
    const s2 = this._$AL;
    try {
      t2 = this.shouldUpdate(s2), t2 ? (this.willUpdate(s2), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
        var _a3;
        return (_a3 = t3.hostUpdate) == null ? void 0 : _a3.call(t3);
      }), this.update(s2)) : this._$EM();
    } catch (s3) {
      throw t2 = false, this._$EM(), s3;
    }
    t2 && this._$AE(s2);
  }
  willUpdate(t2) {
  }
  _$AE(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
      var _a3;
      return (_a3 = t3.hostUpdated) == null ? void 0 : _a3.call(t3);
    }), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t2)), this.updated(t2);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t2) {
    return true;
  }
  update(t2) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((t3) => this._$ET(t3, this[t3]))), this._$EM();
  }
  updated(t2) {
  }
  firstUpdated(t2) {
  }
};
y$1.elementStyles = [], y$1.shadowRootOptions = { mode: "open" }, y$1[d$1("elementProperties")] = /* @__PURE__ */ new Map(), y$1[d$1("finalized")] = /* @__PURE__ */ new Map(), p$1 == null ? void 0 : p$1({ ReactiveElement: y$1 }), (a$1.reactiveElementVersions ?? (a$1.reactiveElementVersions = [])).push("2.1.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t = globalThis, i$1 = (t2) => t2, s$1 = t.trustedTypes, e = s$1 ? s$1.createPolicy("lit-html", { createHTML: (t2) => t2 }) : void 0, h = "$lit$", o$2 = `lit$${Math.random().toFixed(9).slice(2)}$`, n$1 = "?" + o$2, r$2 = `<${n$1}>`, l = document, c = () => l.createComment(""), a = (t2) => null === t2 || "object" != typeof t2 && "function" != typeof t2, u = Array.isArray, d = (t2) => u(t2) || "function" == typeof (t2 == null ? void 0 : t2[Symbol.iterator]), f = "[ 	\n\f\r]", v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, _ = /-->/g, m = />/g, p = RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), g = /'/g, $ = /"/g, y2 = /^(?:script|style|textarea|title)$/i, x = (t2) => (i2, ...s2) => ({ _$litType$: t2, strings: i2, values: s2 }), b = x(1), w = x(2), E = Symbol.for("lit-noChange"), A = Symbol.for("lit-nothing"), C = /* @__PURE__ */ new WeakMap(), P = l.createTreeWalker(l, 129);
function V(t2, i2) {
  if (!u(t2) || !t2.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e ? e.createHTML(i2) : i2;
}
const N = (t2, i2) => {
  const s2 = t2.length - 1, e2 = [];
  let n3, l2 = 2 === i2 ? "<svg>" : 3 === i2 ? "<math>" : "", c2 = v;
  for (let i3 = 0; i3 < s2; i3++) {
    const s3 = t2[i3];
    let a2, u2, d2 = -1, f2 = 0;
    for (; f2 < s3.length && (c2.lastIndex = f2, u2 = c2.exec(s3), null !== u2); ) f2 = c2.lastIndex, c2 === v ? "!--" === u2[1] ? c2 = _ : void 0 !== u2[1] ? c2 = m : void 0 !== u2[2] ? (y2.test(u2[2]) && (n3 = RegExp("</" + u2[2], "g")), c2 = p) : void 0 !== u2[3] && (c2 = p) : c2 === p ? ">" === u2[0] ? (c2 = n3 ?? v, d2 = -1) : void 0 === u2[1] ? d2 = -2 : (d2 = c2.lastIndex - u2[2].length, a2 = u2[1], c2 = void 0 === u2[3] ? p : '"' === u2[3] ? $ : g) : c2 === $ || c2 === g ? c2 = p : c2 === _ || c2 === m ? c2 = v : (c2 = p, n3 = void 0);
    const x2 = c2 === p && t2[i3 + 1].startsWith("/>") ? " " : "";
    l2 += c2 === v ? s3 + r$2 : d2 >= 0 ? (e2.push(a2), s3.slice(0, d2) + h + s3.slice(d2) + o$2 + x2) : s3 + o$2 + (-2 === d2 ? i3 : x2);
  }
  return [V(t2, l2 + (t2[s2] || "<?>") + (2 === i2 ? "</svg>" : 3 === i2 ? "</math>" : "")), e2];
};
let S$1 = class S {
  constructor({ strings: t2, _$litType$: i2 }, e2) {
    let r2;
    this.parts = [];
    let l2 = 0, a2 = 0;
    const u2 = t2.length - 1, d2 = this.parts, [f2, v2] = N(t2, i2);
    if (this.el = S.createElement(f2, e2), P.currentNode = this.el.content, 2 === i2 || 3 === i2) {
      const t3 = this.el.content.firstChild;
      t3.replaceWith(...t3.childNodes);
    }
    for (; null !== (r2 = P.nextNode()) && d2.length < u2; ) {
      if (1 === r2.nodeType) {
        if (r2.hasAttributes()) for (const t3 of r2.getAttributeNames()) if (t3.endsWith(h)) {
          const i3 = v2[a2++], s2 = r2.getAttribute(t3).split(o$2), e3 = /([.?@])?(.*)/.exec(i3);
          d2.push({ type: 1, index: l2, name: e3[2], strings: s2, ctor: "." === e3[1] ? I : "?" === e3[1] ? L : "@" === e3[1] ? z : H }), r2.removeAttribute(t3);
        } else t3.startsWith(o$2) && (d2.push({ type: 6, index: l2 }), r2.removeAttribute(t3));
        if (y2.test(r2.tagName)) {
          const t3 = r2.textContent.split(o$2), i3 = t3.length - 1;
          if (i3 > 0) {
            r2.textContent = s$1 ? s$1.emptyScript : "";
            for (let s2 = 0; s2 < i3; s2++) r2.append(t3[s2], c()), P.nextNode(), d2.push({ type: 2, index: ++l2 });
            r2.append(t3[i3], c());
          }
        }
      } else if (8 === r2.nodeType) if (r2.data === n$1) d2.push({ type: 2, index: l2 });
      else {
        let t3 = -1;
        for (; -1 !== (t3 = r2.data.indexOf(o$2, t3 + 1)); ) d2.push({ type: 7, index: l2 }), t3 += o$2.length - 1;
      }
      l2++;
    }
  }
  static createElement(t2, i2) {
    const s2 = l.createElement("template");
    return s2.innerHTML = t2, s2;
  }
};
function M(t2, i2, s2 = t2, e2) {
  var _a2, _b;
  if (i2 === E) return i2;
  let h2 = void 0 !== e2 ? (_a2 = s2._$Co) == null ? void 0 : _a2[e2] : s2._$Cl;
  const o2 = a(i2) ? void 0 : i2._$litDirective$;
  return (h2 == null ? void 0 : h2.constructor) !== o2 && ((_b = h2 == null ? void 0 : h2._$AO) == null ? void 0 : _b.call(h2, false), void 0 === o2 ? h2 = void 0 : (h2 = new o2(t2), h2._$AT(t2, s2, e2)), void 0 !== e2 ? (s2._$Co ?? (s2._$Co = []))[e2] = h2 : s2._$Cl = h2), void 0 !== h2 && (i2 = M(t2, h2._$AS(t2, i2.values), h2, e2)), i2;
}
class R {
  constructor(t2, i2) {
    this._$AV = [], this._$AN = void 0, this._$AD = t2, this._$AM = i2;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t2) {
    const { el: { content: i2 }, parts: s2 } = this._$AD, e2 = ((t2 == null ? void 0 : t2.creationScope) ?? l).importNode(i2, true);
    P.currentNode = e2;
    let h2 = P.nextNode(), o2 = 0, n3 = 0, r2 = s2[0];
    for (; void 0 !== r2; ) {
      if (o2 === r2.index) {
        let i3;
        2 === r2.type ? i3 = new k(h2, h2.nextSibling, this, t2) : 1 === r2.type ? i3 = new r2.ctor(h2, r2.name, r2.strings, this, t2) : 6 === r2.type && (i3 = new Z(h2, this, t2)), this._$AV.push(i3), r2 = s2[++n3];
      }
      o2 !== (r2 == null ? void 0 : r2.index) && (h2 = P.nextNode(), o2++);
    }
    return P.currentNode = l, e2;
  }
  p(t2) {
    let i2 = 0;
    for (const s2 of this._$AV) void 0 !== s2 && (void 0 !== s2.strings ? (s2._$AI(t2, s2, i2), i2 += s2.strings.length - 2) : s2._$AI(t2[i2])), i2++;
  }
}
class k {
  get _$AU() {
    var _a2;
    return ((_a2 = this._$AM) == null ? void 0 : _a2._$AU) ?? this._$Cv;
  }
  constructor(t2, i2, s2, e2) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t2, this._$AB = i2, this._$AM = s2, this.options = e2, this._$Cv = (e2 == null ? void 0 : e2.isConnected) ?? true;
  }
  get parentNode() {
    let t2 = this._$AA.parentNode;
    const i2 = this._$AM;
    return void 0 !== i2 && 11 === (t2 == null ? void 0 : t2.nodeType) && (t2 = i2.parentNode), t2;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t2, i2 = this) {
    t2 = M(this, t2, i2), a(t2) ? t2 === A || null == t2 || "" === t2 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t2 !== this._$AH && t2 !== E && this._(t2) : void 0 !== t2._$litType$ ? this.$(t2) : void 0 !== t2.nodeType ? this.T(t2) : d(t2) ? this.k(t2) : this._(t2);
  }
  O(t2) {
    return this._$AA.parentNode.insertBefore(t2, this._$AB);
  }
  T(t2) {
    this._$AH !== t2 && (this._$AR(), this._$AH = this.O(t2));
  }
  _(t2) {
    this._$AH !== A && a(this._$AH) ? this._$AA.nextSibling.data = t2 : this.T(l.createTextNode(t2)), this._$AH = t2;
  }
  $(t2) {
    var _a2;
    const { values: i2, _$litType$: s2 } = t2, e2 = "number" == typeof s2 ? this._$AC(t2) : (void 0 === s2.el && (s2.el = S$1.createElement(V(s2.h, s2.h[0]), this.options)), s2);
    if (((_a2 = this._$AH) == null ? void 0 : _a2._$AD) === e2) this._$AH.p(i2);
    else {
      const t3 = new R(e2, this), s3 = t3.u(this.options);
      t3.p(i2), this.T(s3), this._$AH = t3;
    }
  }
  _$AC(t2) {
    let i2 = C.get(t2.strings);
    return void 0 === i2 && C.set(t2.strings, i2 = new S$1(t2)), i2;
  }
  k(t2) {
    u(this._$AH) || (this._$AH = [], this._$AR());
    const i2 = this._$AH;
    let s2, e2 = 0;
    for (const h2 of t2) e2 === i2.length ? i2.push(s2 = new k(this.O(c()), this.O(c()), this, this.options)) : s2 = i2[e2], s2._$AI(h2), e2++;
    e2 < i2.length && (this._$AR(s2 && s2._$AB.nextSibling, e2), i2.length = e2);
  }
  _$AR(t2 = this._$AA.nextSibling, s2) {
    var _a2;
    for ((_a2 = this._$AP) == null ? void 0 : _a2.call(this, false, true, s2); t2 !== this._$AB; ) {
      const s3 = i$1(t2).nextSibling;
      i$1(t2).remove(), t2 = s3;
    }
  }
  setConnected(t2) {
    var _a2;
    void 0 === this._$AM && (this._$Cv = t2, (_a2 = this._$AP) == null ? void 0 : _a2.call(this, t2));
  }
}
class H {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t2, i2, s2, e2, h2) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t2, this.name = i2, this._$AM = e2, this.options = h2, s2.length > 2 || "" !== s2[0] || "" !== s2[1] ? (this._$AH = Array(s2.length - 1).fill(new String()), this.strings = s2) : this._$AH = A;
  }
  _$AI(t2, i2 = this, s2, e2) {
    const h2 = this.strings;
    let o2 = false;
    if (void 0 === h2) t2 = M(this, t2, i2, 0), o2 = !a(t2) || t2 !== this._$AH && t2 !== E, o2 && (this._$AH = t2);
    else {
      const e3 = t2;
      let n3, r2;
      for (t2 = h2[0], n3 = 0; n3 < h2.length - 1; n3++) r2 = M(this, e3[s2 + n3], i2, n3), r2 === E && (r2 = this._$AH[n3]), o2 || (o2 = !a(r2) || r2 !== this._$AH[n3]), r2 === A ? t2 = A : t2 !== A && (t2 += (r2 ?? "") + h2[n3 + 1]), this._$AH[n3] = r2;
    }
    o2 && !e2 && this.j(t2);
  }
  j(t2) {
    t2 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t2 ?? "");
  }
}
class I extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t2) {
    this.element[this.name] = t2 === A ? void 0 : t2;
  }
}
class L extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t2) {
    this.element.toggleAttribute(this.name, !!t2 && t2 !== A);
  }
}
class z extends H {
  constructor(t2, i2, s2, e2, h2) {
    super(t2, i2, s2, e2, h2), this.type = 5;
  }
  _$AI(t2, i2 = this) {
    if ((t2 = M(this, t2, i2, 0) ?? A) === E) return;
    const s2 = this._$AH, e2 = t2 === A && s2 !== A || t2.capture !== s2.capture || t2.once !== s2.once || t2.passive !== s2.passive, h2 = t2 !== A && (s2 === A || e2);
    e2 && this.element.removeEventListener(this.name, this, s2), h2 && this.element.addEventListener(this.name, this, t2), this._$AH = t2;
  }
  handleEvent(t2) {
    var _a2;
    "function" == typeof this._$AH ? this._$AH.call(((_a2 = this.options) == null ? void 0 : _a2.host) ?? this.element, t2) : this._$AH.handleEvent(t2);
  }
}
class Z {
  constructor(t2, i2, s2) {
    this.element = t2, this.type = 6, this._$AN = void 0, this._$AM = i2, this.options = s2;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t2) {
    M(this, t2);
  }
}
const B = t.litHtmlPolyfillSupport;
B == null ? void 0 : B(S$1, k), (t.litHtmlVersions ?? (t.litHtmlVersions = [])).push("3.3.3");
const D = (t2, i2, s2) => {
  const e2 = (s2 == null ? void 0 : s2.renderBefore) ?? i2;
  let h2 = e2._$litPart$;
  if (void 0 === h2) {
    const t3 = (s2 == null ? void 0 : s2.renderBefore) ?? null;
    e2._$litPart$ = h2 = new k(i2.insertBefore(c(), t3), t3, void 0, s2 ?? {});
  }
  return h2._$AI(t2), h2;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const s = globalThis;
class i extends y$1 {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a2;
    const t2 = super.createRenderRoot();
    return (_a2 = this.renderOptions).renderBefore ?? (_a2.renderBefore = t2.firstChild), t2;
  }
  update(t2) {
    const r2 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t2), this._$Do = D(r2, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    var _a2;
    super.connectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(true);
  }
  disconnectedCallback() {
    var _a2;
    super.disconnectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(false);
  }
  render() {
    return E;
  }
}
i._$litElement$ = true, i["finalized"] = true, (_a = s.litElementHydrateSupport) == null ? void 0 : _a.call(s, { LitElement: i });
const o$1 = s.litElementPolyfillSupport;
o$1 == null ? void 0 : o$1({ LitElement: i });
(s.litElementVersions ?? (s.litElementVersions = [])).push("4.2.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const o = { attribute: true, type: String, converter: u$1, reflect: false, hasChanged: f$1 }, r$1 = (t2 = o, e2, r2) => {
  const { kind: n3, metadata: i2 } = r2;
  let s2 = globalThis.litPropertyMetadata.get(i2);
  if (void 0 === s2 && globalThis.litPropertyMetadata.set(i2, s2 = /* @__PURE__ */ new Map()), "setter" === n3 && ((t2 = Object.create(t2)).wrapped = true), s2.set(r2.name, t2), "accessor" === n3) {
    const { name: o2 } = r2;
    return { set(r3) {
      const n4 = e2.get.call(this);
      e2.set.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    }, init(e3) {
      return void 0 !== e3 && this.C(o2, void 0, t2, e3), e3;
    } };
  }
  if ("setter" === n3) {
    const { name: o2 } = r2;
    return function(r3) {
      const n4 = this[o2];
      e2.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
    };
  }
  throw Error("Unsupported decorator location: " + n3);
};
function n2(t2) {
  return (e2, o2) => "object" == typeof o2 ? r$1(t2, e2, o2) : ((t3, e3, o3) => {
    const r2 = e3.hasOwnProperty(o3);
    return e3.constructor.createProperty(o3, t3), r2 ? Object.getOwnPropertyDescriptor(e3, o3) : void 0;
  })(t2, e2, o2);
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
function r(r2) {
  return n2({ ...r2, state: true, attribute: false });
}
function emptyZones() {
  return {
    zone_1_start: void 0,
    end_zone_1: void 0,
    end_zone_2: void 0,
    end_zone_3: void 0,
    zone_1_occupancy: void 0,
    zone_2_occupancy: void 0,
    zone_3_occupancy: void 0
  };
}
const CALIBRATE_TIP = "Or press **Calibrate with empty room** on the Auto-calibrate card to set them from your empty room.";
const RADAR_TIMEOUT_TIP = "**Radar Timeout** is how long presence stays on after the last detection; raise it if lights flick off while you sit still.";
const LD2410_FACTORY_THRESHOLDS = {
  move: [50, 50, 40, 30, 20, 15, 15, 15, 15],
  still: [0, 0, 40, 40, 30, 30, 20, 20, 20]
};
const LD2410_PROFILE = {
  key: "ld2410",
  label: "LD2410",
  maxBarLabels: ["Max Move", "Max Still"],
  rangeLabels: ["Max Move Gate", "Max Still Gate"],
  gateSizeLabel: "Gate Size",
  rangeTip: "💡 **Gate Size** sets how far each gate reaches (e.g. 0.75 m). **Max Move / Still Gate** cap the farthest gate used to detect moving vs. still targets; lower them to ignore distant motion. " + RADAR_TIMEOUT_TIP,
  gateTip: "💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values. " + CALIBRATE_TIP,
  wikiUrl: "https://wiki.apolloautomation.com/products/msr2/setup/zones-ha/",
  entityMap(base) {
    const gates = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const g2 = (suffix) => gates.map((n3) => suffix(n3));
    return {
      engineering_mode: `switch.${base}_radar_engineering_mode`,
      bluetooth: `switch.${base}_ld2410_bluetooth`,
      restart_radar: `button.${base}_restart_radar`,
      factory_reset_radar: `button.${base}_factory_reset_radar`,
      esp_reboot: `button.${base}_esp_reboot`,
      radar_timeout: `number.${base}_radar_timeout`,
      zone_1_start: `number.${base}_radar_zone_1_start`,
      end_zone_1: `number.${base}_radar_end_zone_1`,
      end_zone_2: `number.${base}_radar_end_zone_2`,
      end_zone_3: `number.${base}_radar_end_zone_3`,
      max_move_distance: `number.${base}_radar_max_move_distance`,
      max_still_distance: `number.${base}_radar_max_still_distance`,
      gate_size: `select.${base}_ld2410_gate_size`,
      move_threshold: g2((n3) => `number.${base}_g${n3}_move_threshold`),
      still_threshold: g2((n3) => `number.${base}_g${n3}_still_threshold`),
      move_energy: g2((n3) => `sensor.${base}_g${n3}_move_energy`),
      still_energy: g2((n3) => `sensor.${base}_g${n3}_still_energy`),
      still_distance: `sensor.${base}_radar_still_distance`,
      moving_distance: `sensor.${base}_radar_moving_distance`,
      detection_distance: `sensor.${base}_radar_detection_distance`,
      radar_target: `binary_sensor.${base}_radar_target`,
      moving_target: `binary_sensor.${base}_radar_moving_target`,
      still_target: `binary_sensor.${base}_radar_still_target`,
      zone_1_occupancy: `binary_sensor.${base}_radar_zone_1_occupancy`,
      zone_2_occupancy: `binary_sensor.${base}_radar_zone_2_occupancy`,
      zone_3_occupancy: `binary_sensor.${base}_radar_zone_3_occupancy`
    };
  }
};
const LD2412_PROFILE = {
  key: "ld2412",
  label: "LD2412",
  maxBarLabels: ["Max Gate", "Min Gate"],
  rangeLabels: ["Max Gate", "Min Gate"],
  gateSizeLabel: "Distance Resolution",
  rangeTip: "💡 **Distance Resolution** sets gate spacing: smaller (0.5 m) gives finer tuning over a shorter range, larger (0.75 m) reaches farther. **Min / Max Gate** limit which gates are used for detection. " + RADAR_TIMEOUT_TIP,
  gateTip: "💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values. " + CALIBRATE_TIP,
  wikiUrl: "https://wiki.apolloautomation.com/products/rpro1/setup/zones-ha/#ld2412-configuration",
  entityMap(base) {
    const gates = Array.from({ length: 14 }, (_2, i2) => i2);
    const pad = (n3) => String(n3).padStart(2, "0");
    const g2 = (suffix) => gates.map((n3) => suffix(pad(n3)));
    return {
      engineering_mode: `switch.${base}_ld2412_engineering_mode`,
      bluetooth: `switch.${base}_ld2412_bluetooth`,
      restart_radar: `button.${base}_ld2412_restart`,
      factory_reset_radar: `button.${base}_ld2412_factory_reset`,
      esp_reboot: `button.${base}_esp_reboot`,
      radar_timeout: `number.${base}_ld2412_timeout`,
      ...emptyZones(),
      max_move_distance: `number.${base}_ld2412_max_distance_gate`,
      max_still_distance: `number.${base}_ld2412_min_distance_gate`,
      gate_size: `select.${base}_ld2412_distance_resolution`,
      move_threshold: g2((p2) => `number.${base}_ld2412_g${p2}_move_threshold`),
      still_threshold: g2((p2) => `number.${base}_ld2412_g${p2}_still_threshold`),
      move_energy: g2((p2) => `sensor.${base}_ld2412_g${p2}_move_energy`),
      still_energy: g2((p2) => `sensor.${base}_ld2412_g${p2}_still_energy`),
      // LD2412 distance sensors don't report usable values, so no distance bars
      // are shown — the chart is the gate range + min/max gate only.
      still_distance: void 0,
      moving_distance: void 0,
      detection_distance: void 0,
      radar_target: `binary_sensor.${base}_ld2412_presence`,
      moving_target: `binary_sensor.${base}_ld2412_moving_target`,
      still_target: `binary_sensor.${base}_ld2412_still_target`,
      background_correction: `button.${base}_ld2412_start_dynamic_background_correction`,
      background_correction_status: `binary_sensor.${base}_ld2412_dynamic_background_correction_status`,
      query_params: `button.${base}_ld2412_query_params`
    };
  }
};
const PROFILES = [LD2412_PROFILE, LD2410_PROFILE];
const APOLLO_MODELS = [
  { prefix: "msr-1", profile: LD2410_PROFILE, ld2450: false },
  { prefix: "msr-2", profile: LD2410_PROFILE, ld2450: false },
  { prefix: "mtr-1", ld2450: true },
  { prefix: "r-pro-1", profile: LD2412_PROFILE, ld2450: true }
];
function apolloModelInfo(device) {
  if (!(device == null ? void 0 : device.manufacturer) || !device.model) return void 0;
  if (device.manufacturer.toLowerCase() !== "apolloautomation") return void 0;
  const model = device.model.toLowerCase();
  const hit = APOLLO_MODELS.find((m2) => model.startsWith(m2.prefix));
  return hit ? { profile: hit.profile, ld2450: hit.ld2450 } : void 0;
}
function isEsphomeDevice(hass, deviceId) {
  let sawEntity = false;
  let sawPlatform = false;
  for (const e2 of Object.values(hass.entities)) {
    if (e2.device_id !== deviceId) continue;
    sawEntity = true;
    if (e2.platform === void 0) continue;
    sawPlatform = true;
    if (e2.platform === "esphome") return true;
  }
  return sawEntity && !sawPlatform;
}
function detectProfile(hass, base) {
  for (const p2 of PROFILES) {
    const id = p2.entityMap(base).engineering_mode;
    if (id && id in hass.states) return p2;
  }
  return void 0;
}
const KNOWN_SUFFIXES = [
  // LD2412 — every entity is `{base}_ld2412_...`, so one pattern covers all.
  /_ld2412_.+$/,
  // LD2450 tracking radar — every entity is `{base}_ld2450_...`. Needed so
  // zone-only devices (e.g. MTR-1, no gate radar) still resolve to a base name.
  /_ld2450_.+$/,
  // MTR-1 firmware names its target sensors "Target-1 X" with no chip prefix.
  /_target_\d+_[xy](?:_\d+)?$/,
  // LD2410 (MSR) — varied prefixes.
  /_radar_engineering_mode(?:_\d+)?$/,
  /_ld2410_bluetooth(?:_\d+)?$/,
  /_radar_control_bluetooth(?:_\d+)?$/,
  /_radar_distance_resolution(?:_\d+)?$/,
  /_restart_radar(?:_\d+)?$/,
  /_factory_reset_radar(?:_\d+)?$/,
  /_esp_reboot(?:_\d+)?$/,
  /_radar_timeout(?:_\d+)?$/,
  /_radar_zone_\d+_start(?:_\d+)?$/,
  /_radar_end_zone_\d+(?:_\d+)?$/,
  /_radar_max_move_distance(?:_\d+)?$/,
  /_radar_max_still_distance(?:_\d+)?$/,
  /_ld2410_gate_size(?:_\d+)?$/,
  /_g\d+_move_threshold(?:_\d+)?$/,
  /_g\d+_still_threshold(?:_\d+)?$/,
  /_g\d+_move_energy(?:_\d+)?$/,
  /_g\d+_still_energy(?:_\d+)?$/,
  /_radar_still_distance(?:_\d+)?$/,
  /_radar_moving_distance(?:_\d+)?$/,
  /_radar_detection_distance(?:_\d+)?$/,
  /_radar_moving_target(?:_\d+)?$/,
  /_radar_still_target(?:_\d+)?$/,
  /_radar_target(?:_\d+)?$/,
  /_radar_zone_\d+_occupancy(?:_\d+)?$/
];
function baseFromObjectId(objectId) {
  for (const re of KNOWN_SUFFIXES) {
    if (re.test(objectId)) return objectId.replace(re, "");
  }
  return void 0;
}
function baseNameFromDevice(hass, deviceId) {
  const objectIds = Object.entries(hass.entities).filter(([, e2]) => e2.device_id === deviceId).map(([id]) => id.slice(id.indexOf(".") + 1));
  const counts = /* @__PURE__ */ new Map();
  for (const oid of objectIds) {
    const base = baseFromObjectId(oid);
    if (base) counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  let best;
  let bestCount = 0;
  for (const [base, count] of counts) {
    if (count > bestCount) {
      best = base;
      bestCount = count;
    }
  }
  return best;
}
const DEDUP = "(?:_\\d+)?$";
const S2 = (slot, domain, suffix) => ({
  slot,
  domain,
  re: new RegExp(suffix + DEDUP)
});
const SCALAR_PATTERNS = [
  // LD2410 (MSR) naming.
  S2("engineering_mode", "switch", "_radar_engineering_mode"),
  S2("bluetooth", "switch", "_ld2410_bluetooth"),
  // MSR-1 firmware spells these two differently from the MSR-2.
  S2("bluetooth", "switch", "_radar_control_bluetooth"),
  S2("gate_size", "select", "_radar_distance_resolution"),
  S2("restart_radar", "button", "_restart_radar"),
  S2("factory_reset_radar", "button", "_factory_reset_radar"),
  S2("esp_reboot", "button", "_esp_reboot"),
  S2("radar_timeout", "number", "_radar_timeout"),
  S2("zone_1_start", "number", "_radar_zone_1_start"),
  S2("end_zone_1", "number", "_radar_end_zone_1"),
  S2("end_zone_2", "number", "_radar_end_zone_2"),
  S2("end_zone_3", "number", "_radar_end_zone_3"),
  S2("max_move_distance", "number", "_radar_max_move_distance"),
  S2("max_still_distance", "number", "_radar_max_still_distance"),
  S2("gate_size", "select", "_ld2410_gate_size"),
  S2("still_distance", "sensor", "_radar_still_distance"),
  S2("moving_distance", "sensor", "_radar_moving_distance"),
  S2("detection_distance", "sensor", "_radar_detection_distance"),
  S2("moving_target", "binary_sensor", "_radar_moving_target"),
  S2("still_target", "binary_sensor", "_radar_still_target"),
  S2("radar_target", "binary_sensor", "_radar_target"),
  S2("zone_1_occupancy", "binary_sensor", "_radar_zone_1_occupancy"),
  S2("zone_2_occupancy", "binary_sensor", "_radar_zone_2_occupancy"),
  S2("zone_3_occupancy", "binary_sensor", "_radar_zone_3_occupancy"),
  // LD2412 (R-PRO) naming.
  S2("engineering_mode", "switch", "_ld2412_engineering_mode"),
  S2("bluetooth", "switch", "_ld2412_bluetooth"),
  S2("restart_radar", "button", "_ld2412_restart"),
  S2("factory_reset_radar", "button", "_ld2412_factory_reset"),
  S2("radar_timeout", "number", "_ld2412_timeout"),
  S2("max_move_distance", "number", "_ld2412_max_distance_gate"),
  S2("max_still_distance", "number", "_ld2412_min_distance_gate"),
  S2("gate_size", "select", "_ld2412_distance_resolution"),
  S2("radar_target", "binary_sensor", "_ld2412_presence"),
  S2("moving_target", "binary_sensor", "_ld2412_moving_target"),
  S2("still_target", "binary_sensor", "_ld2412_still_target"),
  // The chip's own background correction (a firmware button and a status
  // flag) and the query-params button the calibration job presses. The
  // backend's gates.py carries the same suffixes; change both together.
  S2("background_correction", "button", "_ld2412_start_dynamic_background_correction"),
  S2(
    "background_correction_status",
    "binary_sensor",
    "_ld2412_dynamic_background_correction_status"
  ),
  S2("query_params", "button", "_ld2412_query_params")
];
const GATE_PATTERNS = [
  ["move_threshold", "number"],
  ["still_threshold", "number"],
  ["move_energy", "sensor"],
  ["still_energy", "sensor"]
].map(([slot, domain]) => ({
  slot,
  domain,
  re: new RegExp(`_g(\\d+)_${slot}${DEDUP}`)
}));
function classifyObjectId(domain, objectId) {
  for (const p2 of GATE_PATTERNS) {
    const m2 = p2.re.exec(objectId);
    if (m2) return domain === p2.domain ? { slot: p2.slot, gate: parseInt(m2[1], 10) } : void 0;
  }
  for (const p2 of SCALAR_PATTERNS) {
    if (p2.re.test(objectId)) {
      return domain === p2.domain ? { slot: p2.slot } : void 0;
    }
  }
  return void 0;
}
const LD2410_MARKERS = [
  /_ld2410_/,
  new RegExp(`_radar_engineering_mode${DEDUP}`),
  new RegExp(`_g\\d+_(?:move|still)_(?:threshold|energy)${DEDUP}`),
  new RegExp(`_radar_max_(?:move|still)_distance${DEDUP}`)
];
function detectProfileFromEntities(hass, deviceId) {
  let sawLd2410 = false;
  for (const [id, e2] of Object.entries(hass.entities)) {
    if (e2.device_id !== deviceId) continue;
    const oid = id.slice(id.indexOf(".") + 1);
    if (/_ld2412_/.test(oid)) return LD2412_PROFILE;
    if (!sawLd2410) sawLd2410 = LD2410_MARKERS.some((re) => re.test(oid));
  }
  return sawLd2410 ? LD2410_PROFILE : void 0;
}
function entityMapFromDevice(hass, deviceId) {
  const map = emptyMap();
  let matched = false;
  for (const [id, e2] of Object.entries(hass.entities)) {
    if (e2.device_id !== deviceId) continue;
    const dot = id.indexOf(".");
    const c2 = classifyObjectId(id.slice(0, dot), id.slice(dot + 1));
    if (!c2) continue;
    if ("gate" in c2) {
      const arr = map[c2.slot];
      if (arr[c2.gate] === void 0) {
        arr[c2.gate] = id;
        matched = true;
      }
    } else if (map[c2.slot] === void 0) {
      map[c2.slot] = id;
      matched = true;
    }
  }
  return matched ? map : void 0;
}
function resolveBase(hass, config) {
  let base;
  if (config.device_id) base = baseNameFromDevice(hass, config.device_id);
  if (!base && config.device_base_name) base = config.device_base_name;
  return base;
}
function resolveProfile(hass, config) {
  if (config.device_id) {
    const fromEntities = detectProfileFromEntities(hass, config.device_id);
    if (fromEntities) return fromEntities;
    const reg = apolloModelInfo(hass.devices[config.device_id]);
    if (reg) return reg.profile;
  }
  const base = resolveBase(hass, config);
  if (!base) return void 0;
  return detectProfile(hass, base) ?? LD2410_PROFILE;
}
function emptyMap() {
  return {
    move_threshold: [],
    still_threshold: [],
    move_energy: [],
    still_energy: []
  };
}
function resolveEntities(hass, config) {
  let resolved;
  if (config.device_id) resolved = entityMapFromDevice(hass, config.device_id);
  if (!resolved) {
    const base = resolveBase(hass, config);
    const profile = base ? detectProfile(hass, base) ?? LD2410_PROFILE : void 0;
    resolved = base && profile ? profile.entityMap(base) : emptyMap();
  }
  if (config.entities) {
    return { ...resolved, ...config.entities };
  }
  return resolved;
}
function exists(hass, id) {
  return !!id && id in hass.states;
}
function entityIds(m2) {
  const out = [];
  for (const v2 of Object.values(m2)) {
    if (typeof v2 === "string") out.push(v2);
    else if (Array.isArray(v2)) {
      for (const id of v2) if (id) out.push(id);
    }
  }
  return out;
}
function resolveRadar(cache, hass, config) {
  if (cache && cache.config === config && cache.entities === hass.entities && cache.devices === hass.devices) {
    return cache;
  }
  const map = resolveEntities(hass, config);
  return {
    config,
    entities: hass.entities,
    devices: hass.devices,
    map,
    profile: resolveProfile(hass, config),
    ids: entityIds(map)
  };
}
function resolvedStatesChanged(oldHass, newHass, ids) {
  return ids.some((id) => oldHass.states[id] !== newHass.states[id]);
}
function anyResolved(hass, ids) {
  return ids.some((id) => id in hass.states);
}
function resolvedDeviceId(hass, config, map) {
  var _a2;
  if (config.device_id) return config.device_id;
  for (const id of entityIds(map)) {
    const deviceId = (_a2 = hass.entities[id]) == null ? void 0 : _a2.device_id;
    if (deviceId) return deviceId;
  }
  return void 0;
}
const pending = /* @__PURE__ */ new Map();
let reassertHooked = false;
function safeDefine(tag, ctor) {
  try {
    if (!window.customElements.get(tag)) {
      window.customElements.define(tag, ctor);
    }
  } catch {
  }
}
function reassertAll() {
  for (const [tag, ctor] of pending) safeDefine(tag, ctor);
}
function registerElement(tag, ctor) {
  pending.set(tag, ctor);
  safeDefine(tag, ctor);
  if (reassertHooked) return;
  reassertHooked = true;
  for (const marker of ["home-assistant", "hc-main"]) {
    window.customElements.whenDefined(marker).then(reassertAll, () => void 0);
  }
}
const VALID_UOMS = ["mm", "cm", "m", "in", "ft", "yd"];
const METERS_PER = {
  mm: 1e-3,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144
};
function isValidUom(u2) {
  return !!u2 && VALID_UOMS.includes(u2);
}
function defaultDistanceUnit(hass) {
  var _a2, _b;
  return ((_b = (_a2 = hass == null ? void 0 : hass.config) == null ? void 0 : _a2.unit_system) == null ? void 0 : _b.length) === "mi" ? "in" : "m";
}
function toMeters(value, uom) {
  return value * METERS_PER[uom];
}
function convert(value, from, to) {
  if (from === to) return value;
  return toMeters(value, from) / METERS_PER[to];
}
function numState(hass, id) {
  if (!id) return void 0;
  const ent = hass.states[id];
  if (!ent) return void 0;
  const v2 = parseFloat(ent.state);
  return Number.isFinite(v2) ? v2 : void 0;
}
function uomOf(hass, id, fallback) {
  var _a2, _b;
  const uom = id ? (_b = (_a2 = hass.states[id]) == null ? void 0 : _a2.attributes) == null ? void 0 : _b.unit_of_measurement : void 0;
  return isValidUom(uom) ? uom : fallback;
}
function parseGateSizeMeters(state) {
  if (!state) return void 0;
  const match = state.replace(",", ".").match(/[0-9]*\.?[0-9]+/);
  if (!match) return void 0;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) ? value : void 0;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function scaleX(value, maxRange, width) {
  if (maxRange <= 0) return 0;
  return clamp(value / maxRange * width, 0, width);
}
const DEFAULT_GATE_SIZE_M = 0.75;
const GATE_COUNT = 8;
const STILL_COLOR$1 = "#2e7d32";
const MOVE_COLOR$1 = "#6a1b9a";
const DETECTION_COLOR = "#b71c1c";
const ZONE_COLORS = ["#d32f2f", "#1565c0", "#2e7d32"];
function gateColor(i2, count) {
  const hue = 220 - 220 * i2 / Math.max(1, count - 1);
  return `hsl(${hue}, 64%, 48%)`;
}
const TXT = "var(--primary-text-color, #e6e6e6)";
const TXT2 = "var(--secondary-text-color, #9aa0a6)";
function distInUnit(hass, id, unit) {
  const v2 = numState(hass, id);
  if (v2 === void 0) return void 0;
  return convert(v2, uomOf(hass, id, unit), unit);
}
function distanceModel(hass, m2, unit) {
  var _a2, _b;
  const gateSizeM = parseGateSizeMeters(m2.gate_size ? (_a2 = hass.states[m2.gate_size]) == null ? void 0 : _a2.state : void 0) ?? DEFAULT_GATE_SIZE_M;
  const gateSizeChart = convert(gateSizeM, "m", unit);
  const gateCount = m2.move_threshold.length > 1 ? m2.move_threshold.length - 1 : GATE_COUNT;
  const maxRange = gateSizeChart * gateCount;
  const bars = [];
  const pushBar = (id, label, color) => {
    if (!id || !(id in hass.states)) return;
    bars.push({ label, value: distInUnit(hass, id, unit) ?? 0, color });
  };
  pushBar(m2.detection_distance, "Detection", DETECTION_COLOR);
  pushBar(m2.moving_distance, "Moving", MOVE_COLOR$1);
  pushBar(m2.still_distance, "Still", STILL_COLOR$1);
  const zones = [];
  const bounds = [
    distInUnit(hass, m2.zone_1_start, unit),
    distInUnit(hass, m2.end_zone_1, unit),
    distInUnit(hass, m2.end_zone_2, unit),
    distInUnit(hass, m2.end_zone_3, unit)
  ];
  const occ = [m2.zone_1_occupancy, m2.zone_2_occupancy, m2.zone_3_occupancy];
  for (let i2 = 0; i2 < 3; i2++) {
    const start = bounds[i2];
    const end = bounds[i2 + 1];
    if (start === void 0 || end === void 0) continue;
    const occId = occ[i2];
    zones.push({
      label: `Zone ${i2 + 1}`,
      start,
      end,
      color: ZONE_COLORS[i2],
      occupied: !!occId && ((_b = hass.states[occId]) == null ? void 0 : _b.state) === "on"
    });
  }
  const maxStillGate = numState(hass, m2.max_still_distance);
  const maxMoveGate = numState(hass, m2.max_move_distance);
  return {
    unit,
    gateSizeChart,
    gateCount,
    maxRange,
    bars,
    zones,
    maxStill: maxStillGate === void 0 ? void 0 : maxStillGate * gateSizeChart,
    maxMove: maxMoveGate === void 0 ? void 0 : maxMoveGate * gateSizeChart,
    maxStillGate,
    maxMoveGate
  };
}
const WIDTH$1 = 478;
const LBL = 64;
const RPAD = 12;
const INNER = WIDTH$1 - LBL - RPAD;
const TOP = 6;
const ROW_H = 30;
const BAR_H = ROW_H - 8;
const AXIS_H = 36;
const MID = BAR_H / 2 + 4;
function rowLabel(r2) {
  if (r2.kind === "zones") return "Zones";
  if (r2.kind === "gates") return "Gates";
  if (r2.kind === "bar") return r2.bar.label;
  return r2.label;
}
function rowTip(r2) {
  if (r2.kind === "zones")
    return "Detection zones. The circle shows whether a target is currently in each zone (filled = present).";
  if (r2.kind === "gates")
    return "The radar splits its range into gates — each colored segment is one distance bin (G1, G2, ...).";
  if (r2.kind === "max")
    return `${r2.label}: the configured detection-range limit, shown as a gate number.`;
  if (r2.bar.label === "Detection")
    return "Current distance to the detected target.";
  if (r2.bar.label === "Moving")
    return "Current distance to a moving target.";
  return "Current distance to a still (stationary) target.";
}
function valueLabel(xEnd, text, y3) {
  const inside = xEnd > WIDTH$1 * 0.62;
  return inside ? w`<text x=${xEnd - 6} y=${y3 + MID} font-size="13" text-anchor="end" fill="#fff">${text}</text>` : w`<text x=${xEnd + 6} y=${y3 + MID} font-size="13" fill=${TXT}>${text}</text>`;
}
function renderDistanceChart(hass, m2, unit, maxLabels = ["Max Move", "Max Still"]) {
  if (m2.move_threshold.length === 0) return A;
  const model = distanceModel(hass, m2, unit);
  const x2 = (v2) => LBL + scaleX(v2, model.maxRange, INNER);
  const fmt = (v2) => `${v2.toFixed(1)} ${unit}`;
  const rows = [];
  if (model.zones.length) rows.push({ kind: "zones" });
  for (const bar of model.bars) rows.push({ kind: "bar", bar });
  rows.push({ kind: "gates" });
  if (model.maxMove !== void 0)
    rows.push({ kind: "max", label: maxLabels[0], value: model.maxMove, gate: model.maxMoveGate, color: MOVE_COLOR$1 });
  if (model.maxStill !== void 0)
    rows.push({ kind: "max", label: maxLabels[1], value: model.maxStill, gate: model.maxStillGate, color: STILL_COLOR$1 });
  const plotBottom = TOP + rows.length * ROW_H;
  const height = plotBottom + AXIS_H;
  const tickFmt = (v2) => model.gateSizeChart >= 10 ? v2.toFixed(0) : String(Number(v2.toFixed(2)));
  const axis = [];
  for (let i2 = 0; i2 <= model.gateCount; i2++) {
    const gx = x2(model.gateSizeChart * i2);
    const val = model.gateSizeChart * i2;
    axis.push(w`
      <line x1=${gx} y1=${TOP} x2=${gx} y2=${plotBottom}
        stroke="var(--divider-color, #555)" stroke-width="1" opacity="0.3"></line>
      <text x=${gx} y=${plotBottom + 13} font-size="11" text-anchor="end"
        transform="rotate(-45 ${gx} ${plotBottom + 13})" fill=${TXT2}>${tickFmt(val)} ${unit}</text>`);
  }
  const rowEls = rows.map((r2, i2) => {
    const y3 = TOP + i2 * ROW_H;
    const label = w`<text x=${LBL - 6} y=${y3 + MID} font-size="12"
      text-anchor="end" fill=${TXT2}>${rowLabel(r2)}</text>`;
    let content;
    if (r2.kind === "zones") {
      content = model.zones.map((z2, idx) => {
        const x0 = x2(z2.start);
        const x1 = x2(z2.end);
        const w$1 = x1 - x0;
        const showLabel = w$1 >= 40;
        return w`
          <rect x=${x0} y=${y3} width=${Math.max(1, w$1)} height=${BAR_H}
            rx="4" fill=${z2.color} opacity=${z2.occupied ? 0.95 : 0.6}></rect>
          ${showLabel ? w`<text x=${x0 + 6} y=${y3 + MID} font-size="13" font-weight="600"
                fill="#fff">Z${idx + 1}</text>` : A}
          <circle cx=${x1 - 11} cy=${y3 + BAR_H / 2} r="5"
            fill=${z2.occupied ? "#fff" : "none"} stroke="#fff" stroke-width="2"></circle>`;
      });
    } else if (r2.kind === "bar") {
      const xe = x2(r2.bar.value);
      content = w`
        <rect x=${LBL} y=${y3} width=${Math.max(1, xe - LBL)} height=${BAR_H}
          rx="4" fill=${r2.bar.color}></rect>
        ${valueLabel(xe, fmt(r2.bar.value), y3)}`;
    } else if (r2.kind === "gates") {
      const segs = [];
      for (let g2 = 0; g2 < model.gateCount; g2++) {
        const x0 = x2(model.gateSizeChart * g2);
        const x1 = x2(model.gateSizeChart * (g2 + 1));
        segs.push(w`
          <rect x=${x0} y=${y3} width=${Math.max(1, x1 - x0)} height=${BAR_H}
            fill=${gateColor(g2, model.gateCount)}></rect>
          <text x=${(x0 + x1) / 2} y=${y3 + MID} font-size="12" font-weight="600"
            text-anchor="middle" fill="#fff">G${g2 + 1}</text>`);
      }
      content = segs;
    } else {
      const xe = x2(r2.value);
      const text = r2.gate !== void 0 ? `G${r2.gate}` : fmt(r2.value);
      content = w`
        <rect x=${LBL} y=${y3} width=${Math.max(1, xe - LBL)} height=${BAR_H}
          rx="4" fill=${r2.color} opacity="0.6"></rect>
        <text x=${(LBL + xe) / 2} y=${y3 + MID} font-size="13" font-weight="600"
          text-anchor="middle" fill="#fff">${text}</text>`;
    }
    return w`<g>
      <title>${rowTip(r2)}</title>
      <rect x="0" y=${y3} width=${WIDTH$1} height=${BAR_H} fill="transparent"></rect>
      ${label}${content}
    </g>`;
  });
  return b`
    <svg viewBox="0 0 ${WIDTH$1} ${height}" width="100%" role="img"
      aria-label="LD2410 distances">
      ${axis} ${rowEls}
    </svg>
  `;
}
var __defProp$2 = Object.defineProperty;
var __decorateClass$2 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
    if (decorator = decorators[i2])
      result = decorator(target, key, result) || result;
  if (result) __defProp$2(target, key, result);
  return result;
};
const _ApolloLd2410DistanceCard = class _ApolloLd2410DistanceCard extends i {
  setConfig(config) {
    this._config = config;
  }
  getCardSize() {
    return 6;
  }
  static getStubConfig() {
    return { type: "custom:apollo-radar-distance-card" };
  }
  /** Skip the hass ticks (most of them) that touch none of our entities. */
  shouldUpdate(changed) {
    if (!changed.has("hass") || changed.has("_config")) return true;
    const oldHass = changed.get("hass");
    if (!oldHass || !this.hass || !this._config) return true;
    if (oldHass.entities !== this.hass.entities || oldHass.devices !== this.hass.devices || oldHass.config !== this.hass.config) {
      return true;
    }
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return resolvedStatesChanged(oldHass, this.hass, this._resolved.ids);
  }
  render() {
    if (!this.hass || !this._config) return A;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    const { map: m2, profile, ids } = this._resolved;
    if (!anyResolved(this.hass, ids)) return this._renderNotFound();
    const unit = isValidUom(this._config.distance_unit) ? this._config.distance_unit : defaultDistanceUnit(this.hass);
    const chart = renderDistanceChart(this.hass, m2, unit, profile == null ? void 0 : profile.maxBarLabels);
    if (chart === A) return A;
    return b`
      <ha-card .header=${this._config.title ?? "LD2410 Distances"}>
        <div class="wrap">${chart}</div>
      </ha-card>
    `;
  }
  _renderNotFound() {
    var _a2;
    return b`
      <ha-card .header=${((_a2 = this._config) == null ? void 0 : _a2.title) ?? "LD2410 Distances"}>
        <div class="not-found">
          Apollo mmWave: device not found — check the card's device
          configuration.
        </div>
      </ha-card>
    `;
  }
};
_ApolloLd2410DistanceCard.styles = i$3`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
  `;
let ApolloLd2410DistanceCard = _ApolloLd2410DistanceCard;
__decorateClass$2([
  n2({ attribute: false })
], ApolloLd2410DistanceCard.prototype, "hass");
__decorateClass$2([
  r()
], ApolloLd2410DistanceCard.prototype, "_config");
registerElement("apollo-radar-distance-card", ApolloLd2410DistanceCard);
const customCards$2 = window.customCards = window.customCards || [];
if (!customCards$2.some((c2) => c2.type === "apollo-radar-distance-card")) {
  customCards$2.push({
    type: "apollo-radar-distance-card",
    name: "Apollo Radar Distance Chart",
    description: "Distance / zone chart for Apollo MSR (LD2410) & R-PRO (LD2412).",
    documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main"
  });
}
const DOMAIN = "apollo_mmwave";
const CALIBRATION_SUBSCRIBE = `${DOMAIN}/calibration/subscribe`;
const CONFIG_ENTRIES_SUBSCRIBE = "config_entries/subscribe";
const SERVICE_CALIBRATE_GATES = "calibrate_gates";
const SERVICE_CANCEL_CALIBRATION = "cancel_calibration";
const SERVICE_RESTORE_GATE_THRESHOLDS = "restore_gate_thresholds";
const CALIBRATION_RETRY_DELAYS_MS = [1e3, 2e3, 5e3, 1e4, 2e4];
const ERR_NOT_LOADED = "not_loaded";
const ERR_NOT_FOUND = "not_found";
const NOT_LOADED_MESSAGE = "Apollo mmWave is not loaded, so calibration is unavailable.";
const NO_DEVICE_MESSAGE = "Home Assistant has no device with this id. The radar was probably removed and re-added; reload the dashboard, or set device_id in the card YAML.";
const REJECTED_MESSAGE = "Home Assistant rejected the request.";
const VALIDATION_PREFIX = /^Validation error:\s*/;
async function subscribeCalibration(hass, deviceId, callback) {
  return hass.connection.subscribeMessage(callback, {
    type: CALIBRATION_SUBSCRIBE,
    device_id: deviceId
  });
}
async function subscribeEntryLoads(hass, callback) {
  try {
    return await hass.connection.subscribeMessage(
      (changes) => {
        const list = Array.isArray(changes) ? changes : [changes];
        if (list.some(
          (change) => {
            var _a2, _b;
            return ((change == null ? void 0 : change.type) === "updated" || (change == null ? void 0 : change.type) === "added") && ((_a2 = change == null ? void 0 : change.entry) == null ? void 0 : _a2.domain) === DOMAIN && ((_b = change == null ? void 0 : change.entry) == null ? void 0 : _b.state) === "loaded";
          }
        )) {
          callback();
        }
      },
      { type: CONFIG_ENTRIES_SUBSCRIBE }
    );
  } catch {
    return null;
  }
}
function callService(hass, domain, service, data, notifyOnError = false) {
  return hass.callService(domain, service, data, void 0, notifyOnError);
}
function definedOnly(opts) {
  const out = {};
  for (const [key, value] of Object.entries(opts)) {
    if (value !== void 0) out[key] = value;
  }
  return out;
}
function startCalibration(hass, deviceId, opts = {}) {
  return callService(hass, DOMAIN, SERVICE_CALIBRATE_GATES, {
    device_id: deviceId,
    ...definedOnly(opts)
  });
}
function cancelCalibration(hass, deviceId) {
  return callService(hass, DOMAIN, SERVICE_CANCEL_CALIBRATION, {
    device_id: deviceId
  });
}
function restoreThresholds(hass, deviceId, snapshotId) {
  return callService(hass, DOMAIN, SERVICE_RESTORE_GATE_THRESHOLDS, {
    device_id: deviceId,
    ...snapshotId ? { snapshot_id: snapshotId } : {}
  });
}
function turnEngineeringMode(hass, switchId, on) {
  return callService(hass, "switch", "turn_off", {
    entity_id: switchId
  });
}
function errorPayload(error) {
  if (error && typeof error === "object" && error.code === void 0) {
    const inner = error.error;
    if (inner && typeof inner === "object") return inner;
  }
  return error;
}
function sentence(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
function localized(err, localize) {
  const domain = err == null ? void 0 : err.translation_domain;
  const key = err == null ? void 0 : err.translation_key;
  if (!localize || !domain || !key) return null;
  let text;
  try {
    text = localize(
      `component.${domain}.exceptions.${key}.message`,
      err.translation_placeholders ?? void 0
    );
  } catch {
    return null;
  }
  if (!text || text.startsWith("Translation error")) return null;
  return sentence(text);
}
function describeError(error, opts = {}) {
  var _a2;
  const err = errorPayload(error);
  const code = err == null ? void 0 : err.code;
  if (code === ERR_NOT_FOUND) {
    if (opts.source !== "service") return NO_DEVICE_MESSAGE;
    const domain = (_a2 = err == null ? void 0 : err.translation_placeholders) == null ? void 0 : _a2.domain;
    if (domain === void 0 || domain === DOMAIN) return NOT_LOADED_MESSAGE;
  }
  if (code === ERR_NOT_LOADED) return NOT_LOADED_MESSAGE;
  const translated = localized(err, opts.localize);
  if (translated) return translated;
  const raw = typeof err === "string" ? err : err == null ? void 0 : err.message;
  if (raw) {
    const message = String(raw).replace(VALIDATION_PREFIX, "");
    if (message.trim()) return sentence(message);
  }
  return REJECTED_MESSAGE;
}
async function exceptionLocalizer(hass, error) {
  var _a2;
  const domain = (_a2 = errorPayload(error)) == null ? void 0 : _a2.translation_domain;
  if (domain && typeof hass.loadBackendTranslation === "function") {
    try {
      const loaded = await hass.loadBackendTranslation("exceptions", domain);
      if (typeof loaded === "function") return loaded;
    } catch {
    }
  }
  return typeof hass.localize === "function" ? hass.localize.bind(hass) : void 0;
}
async function describeServiceError(hass, error) {
  const localize = await exceptionLocalizer(hass, error);
  return describeError(error, { source: "service", localize });
}
const MOVE_COLOR = "#4b0082";
const MOVE_THR_COLOR = "#9467bd";
const STILL_COLOR = "#274e13";
const STILL_THR_COLOR = "#8cb640";
function gateEnergyModel(hass, m2) {
  var _a2;
  let present = false;
  const seen = (id) => {
    if (id && id in hass.states) present = true;
  };
  const count = m2.move_threshold.length;
  const gates = Array.from({ length: count }, (_2, n3) => {
    seen(m2.move_energy[n3]);
    seen(m2.still_energy[n3]);
    seen(m2.move_threshold[n3]);
    seen(m2.still_threshold[n3]);
    return {
      index: n3,
      move: numState(hass, m2.move_energy[n3]) ?? 0,
      still: numState(hass, m2.still_energy[n3]) ?? 0,
      moveThr: numState(hass, m2.move_threshold[n3]),
      stillThr: numState(hass, m2.still_threshold[n3])
    };
  });
  return {
    engineeringMode: !!m2.engineering_mode && ((_a2 = hass.states[m2.engineering_mode]) == null ? void 0 : _a2.state) === "on",
    present,
    gates
  };
}
const WIDTH = 470;
const HEIGHT = 220;
const PAD_L = 26;
const PAD_B = 24;
const PAD_T = 10;
const PLOT_H = HEIGHT - PAD_B - PAD_T;
const MAX_ENERGY = 100;
const BUTTON_PLOT_FRACTION = 0.8;
function yFor(energy) {
  const clamped = Math.max(0, Math.min(MAX_ENERGY, energy));
  return PAD_T + PLOT_H * (1 - clamped / MAX_ENERGY);
}
function renderGateEnergyChart(hass, m2) {
  var _a2;
  const model = gateEnergyModel(hass, m2);
  if (!model.present) return A;
  const slot = (WIDTH - PAD_L) / model.gates.length;
  const barW = slot * 0.32;
  const baseY = yFor(0);
  const bars = model.gates.map((g2) => {
    const cx = PAD_L + slot * g2.index + slot / 2;
    const moveX = cx - barW - 2;
    const stillX = cx + 2;
    const els = [];
    const moveAbove = model.engineeringMode && g2.moveThr !== void 0 && g2.move > g2.moveThr;
    const stillAbove = model.engineeringMode && g2.stillThr !== void 0 && g2.still > g2.stillThr;
    els.push(w`
      <rect x=${moveX} y=${yFor(g2.move)} width=${barW} height=${baseY - yFor(g2.move)}
        fill=${MOVE_COLOR}
        stroke="${moveAbove ? MOVE_THR_COLOR : A}"
        stroke-width="${moveAbove ? "2" : A}"></rect>
      <rect x=${stillX} y=${yFor(g2.still)} width=${barW} height=${baseY - yFor(g2.still)}
        fill=${STILL_COLOR}
        stroke="${stillAbove ? STILL_THR_COLOR : A}"
        stroke-width="${stillAbove ? "2" : A}"></rect>
      <text x=${cx} y=${HEIGHT - 7} font-size="13" text-anchor="middle"
        fill="var(--secondary-text-color)">G${g2.index}</text>`);
    if (model.engineeringMode && g2.moveThr !== void 0) {
      const ty = yFor(g2.moveThr);
      const tx = moveX + barW / 2;
      els.push(w`<path d="M ${tx - 5} ${ty - 5} L ${tx - 5} ${ty + 5} L ${tx + 5} ${ty} Z"
        fill=${MOVE_THR_COLOR}></path>`);
    }
    if (model.engineeringMode && g2.stillThr !== void 0) {
      const ty = yFor(g2.stillThr);
      const tx = stillX + barW / 2;
      els.push(w`<path d="M ${tx + 5} ${ty - 5} L ${tx + 5} ${ty + 5} L ${tx - 5} ${ty} Z"
        fill=${STILL_THR_COLOR}></path>`);
    }
    return els;
  });
  const gridlines = [0, 25, 50, 75, 100].map(
    (v2) => w`
      <line x1=${PAD_L} y1=${yFor(v2)} x2=${WIDTH} y2=${yFor(v2)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${PAD_L - 4} y=${yFor(v2) + 3} font-size="11" text-anchor="end"
        fill="var(--secondary-text-color)">${v2}</text>`
  );
  const overlay = model.engineeringMode ? A : w`
        <rect x=${PAD_L} y=${PAD_T} width=${WIDTH - PAD_L} height=${PLOT_H}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${(WIDTH + PAD_L) / 2} y=${PAD_T + PLOT_H / 2} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${(WIDTH + PAD_L) / 2} dy="-4">Turn on Radar Engineering Mode</tspan>
          <tspan x=${(WIDTH + PAD_L) / 2} dy="28">to see gate energy values</tspan>
        </text>`;
  const switchId = m2.engineering_mode;
  const switchState = switchId ? (_a2 = hass.states[switchId]) == null ? void 0 : _a2.state : void 0;
  const canTurnOn = !model.engineeringMode && !!switchId && !!hass.callService && switchState !== void 0 && switchState !== "unavailable";
  const buttonTop = (PAD_T + PLOT_H * BUTTON_PLOT_FRACTION) / HEIGHT * 100;
  const buttonLeft = (PAD_L + (WIDTH - PAD_L) / 2) / WIDTH * 100;
  const turnOn = () => callService(
    hass,
    "switch",
    "turn_on",
    { entity_id: switchId },
    true
  ).catch(() => void 0);
  const overlayButton = canTurnOn ? b`<button
        type="button"
        class="overlay"
        tabindex="0"
        style="position:absolute;left:${buttonLeft}%;top:${buttonTop}%;transform:translate(-50%,-50%)"
        @click=${turnOn}
      >
        Turn on Radar Engineering Mode
      </button>` : A;
  const plot = b`
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" role="img"
      aria-label="LD2410 gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A gate
        detects a target when its energy rises above the threshold. Turn on
        Radar Engineering Mode to see live energy.
      </title>
      ${gridlines} ${bars} ${overlay}
    </svg>
  `;
  return b`
    <div class="chart-plot" style="position:relative">
      ${plot} ${overlayButton}
    </div>
    <div class="chart-legend">
      <span><span style="color:${MOVE_COLOR}">■</span> Move energy</span>
      <span><span style="color:${STILL_COLOR}">■</span> Still energy</span>
      <span><span style="color:${MOVE_THR_COLOR}">▶</span> Move threshold</span>
      <span><span style="color:${STILL_THR_COLOR}">◀</span> Still threshold</span>
      <span>outlined bar = above threshold (detecting)</span>
    </div>
  `;
}
var __defProp$1 = Object.defineProperty;
var __decorateClass$1 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
    if (decorator = decorators[i2])
      result = decorator(target, key, result) || result;
  if (result) __defProp$1(target, key, result);
  return result;
};
const _ApolloLd2410GateEnergyCard = class _ApolloLd2410GateEnergyCard extends i {
  setConfig(config) {
    this._config = config;
  }
  getCardSize() {
    return 6;
  }
  static getStubConfig() {
    return { type: "custom:apollo-radar-gate-energy-card" };
  }
  /** Skip the hass ticks (most of them) that touch none of our entities. */
  shouldUpdate(changed) {
    if (!changed.has("hass") || changed.has("_config")) return true;
    const oldHass = changed.get("hass");
    if (!oldHass || !this.hass || !this._config) return true;
    if (oldHass.entities !== this.hass.entities || oldHass.devices !== this.hass.devices) {
      return true;
    }
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return resolvedStatesChanged(oldHass, this.hass, this._resolved.ids);
  }
  render() {
    if (!this.hass || !this._config) return A;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    const { map: m2, ids } = this._resolved;
    if (!anyResolved(this.hass, ids)) return this._renderNotFound();
    const chart = renderGateEnergyChart(this.hass, m2);
    if (chart === A) return A;
    return b`
      <ha-card .header=${this._config.title ?? "LD2410 Gate Energy"}>
        <div class="wrap">${chart}</div>
      </ha-card>
    `;
  }
  _renderNotFound() {
    var _a2;
    return b`
      <ha-card .header=${((_a2 = this._config) == null ? void 0 : _a2.title) ?? "LD2410 Gate Energy"}>
        <div class="not-found">
          Apollo mmWave: device not found — check the card's device
          configuration.
        </div>
      </ha-card>
    `;
  }
};
_ApolloLd2410GateEnergyCard.styles = i$3`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
    .chart-legend {
      font-size: 0.8em;
      color: var(--secondary-text-color);
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      margin-top: 6px;
    }
    /* The chart's engineering-mode button; its position is inline so the
       chart template is self-contained. */
    button.overlay {
      font: inherit;
      font-size: 0.9em;
      font-weight: 500;
      cursor: pointer;
      border: none;
      border-radius: 4px;
      padding: 8px 14px;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      white-space: nowrap;
    }
  `;
let ApolloLd2410GateEnergyCard = _ApolloLd2410GateEnergyCard;
__decorateClass$1([
  n2({ attribute: false })
], ApolloLd2410GateEnergyCard.prototype, "hass");
__decorateClass$1([
  r()
], ApolloLd2410GateEnergyCard.prototype, "_config");
registerElement("apollo-radar-gate-energy-card", ApolloLd2410GateEnergyCard);
const customCards$1 = window.customCards = window.customCards || [];
if (!customCards$1.some((c2) => c2.type === "apollo-radar-gate-energy-card")) {
  customCards$1.push({
    type: "apollo-radar-gate-energy-card",
    name: "Apollo Radar Gate Energy Chart",
    description: "Per-gate move/still energy chart for Apollo MSR (LD2410) & R-PRO (LD2412).",
    documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main"
  });
}
const DEFAULT_SETTLE_S = 15;
const DEFAULT_DURATION_S = 60;
const TOLERANCE = 0.5;
const KEEP_ON_LD2410 = "Leave Radar Engineering Mode on until this finishes.";
const KEEP_ON_LD2412 = "Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes.";
const WALK_AROUND_LINE = "Now walk around: the Radar Target row in Target / Occupancy should turn on when you move and off a few seconds after you stop (Radar Timeout).";
const NOTHING_TO_RESTORE = "Nothing to restore yet";
const TERMINAL = /* @__PURE__ */ new Set(["done", "cancelled", "failed"]);
function isTerminal(status) {
  return status !== void 0 && TERMINAL.has(status);
}
function parseDate(iso) {
  if (!iso) return null;
  const d2 = new Date(iso);
  return Number.isNaN(d2.getTime()) ? null : d2;
}
function sameDay(a2, b2) {
  return a2.toDateString() === b2.toDateString();
}
const TIME_OPTS = { hour: "2-digit", minute: "2-digit" };
const DAY_OPTS = { day: "numeric", month: "short" };
function formatTime(iso, now = /* @__PURE__ */ new Date()) {
  const d2 = parseDate(iso);
  if (!d2) return iso;
  const opts = sameDay(d2, now) ? TIME_OPTS : { ...DAY_OPTS, ...TIME_OPTS };
  return new Intl.DateTimeFormat(void 0, opts).format(d2);
}
function formatDayTime(iso) {
  const d2 = parseDate(iso);
  if (!d2) return iso;
  return new Intl.DateTimeFormat(void 0, { ...DAY_OPTS, ...TIME_OPTS }).format(d2);
}
function durationText(seconds) {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}
function idleSentence(settleS, durationS) {
  const listen = `listens for ${durationText(durationS)}, then sets every gate's move and still threshold just above the background it heard.`;
  const middle = settleS > 0 ? `It counts down ${durationText(settleS)} so you can leave, ${listen}` : `It ${listen}`;
  return `Teach the radar what your empty room looks like. ${middle} Your current thresholds are saved first, so you can undo.`;
}
function plural(n3, word) {
  return `${n3} ${n3 === 1 ? word : `${word}s`}`;
}
function sortedGateKeys(peaks) {
  return Object.keys(peaks).sort((a2, b2) => Number(a2) - Number(b2));
}
function livePeaksLine(job) {
  var _a2;
  const lines = [];
  for (const channel of ["move", "still"]) {
    const peaks = ((_a2 = job.peaks) == null ? void 0 : _a2[channel]) ?? {};
    const keys = sortedGateKeys(peaks);
    if (keys.length === 0) continue;
    const parts = keys.map((k2) => `G${k2} ${peaks[k2]}`).join(" · ");
    lines.push(`Highest so far, ${channel}: ${parts}`);
  }
  return lines;
}
function keepOnLine(profile) {
  return profile === "ld2412" ? KEEP_ON_LD2412 : KEEP_ON_LD2410;
}
const READING_THRESHOLDS = "Reading the radar's current thresholds...";
const VERIFYING = "Checking that the radar accepted the new values...";
const RESTORING = "Restoring saved thresholds...";
const ENGINEERING_ON = "Turning on Radar Engineering Mode...";
const FINISHING = "Finishing...";
function phaseHeadline(job) {
  if (job.kind === "restore") {
    switch (job.status) {
      case "applying":
        return job.sub_phase === "refresh" ? { phase: READING_THRESHOLDS, detail: "" } : { phase: RESTORING, detail: `${job.writes_done} of ${job.writes_total}` };
      case "verifying":
        return { phase: VERIFYING, detail: "" };
      case "preparing":
        return { phase: RESTORING, detail: "" };
      default:
        return { phase: FINISHING, detail: "" };
    }
  }
  switch (job.status) {
    case "preparing":
      if (job.sub_phase === "settle") return { phase: "Leave the room now.", detail: "" };
      if (job.sub_phase === "warmup") {
        return { phase: "Waiting for gate energy from the radar...", detail: "" };
      }
      return { phase: ENGINEERING_ON, detail: "" };
    case "sampling":
      return {
        phase: "Listening to the empty room...",
        detail: `${job.remaining_s ?? job.duration_s} s left`
      };
    case "applying":
      if (job.sub_phase === "refresh") return { phase: READING_THRESHOLDS, detail: "" };
      return {
        phase: `Writing ${job.writes_total} thresholds to the radar...`,
        detail: `${job.writes_done} of ${job.writes_total}`
      };
    case "verifying":
      return { phase: VERIFYING, detail: "" };
    default:
      return { phase: FINISHING, detail: "" };
  }
}
function phaseLabel(job, profile) {
  const keepOn = keepOnLine(profile);
  const { phase, detail } = phaseHeadline(job);
  const headline = detail ? `${phase} ${detail}` : phase;
  if (job.kind === "restore") return [headline];
  switch (job.status) {
    case "preparing":
      if (job.sub_phase === "engineering") return [headline];
      if (job.sub_phase === "settle") {
        const remaining = job.remaining_s ?? job.settle_s;
        return [headline, `Listening starts in ${remaining} s.`, keepOn];
      }
      return [headline, keepOn];
    case "sampling":
      return [
        headline,
        `Keep the room empty. ${plural(job.samples, "sample")} so far.`,
        ...livePeaksLine(job),
        keepOn
      ];
    case "applying":
      if (job.sub_phase === "refresh") return [headline];
      return [headline, "Values already written stay until you undo."];
    default:
      return [headline];
  }
}
function clamp01(v2) {
  if (!Number.isFinite(v2)) return 0;
  return Math.max(0, Math.min(1, v2));
}
function progress(job) {
  if (job.status === "preparing" && job.sub_phase === "settle" && job.settle_s > 0) {
    return {
      fraction: clamp01(job.elapsed_s / job.settle_s),
      label: `${job.remaining_s ?? job.settle_s} s`
    };
  }
  if (job.status === "sampling" && job.duration_s > 0) {
    return {
      fraction: clamp01(job.elapsed_s / job.duration_s),
      label: `${job.remaining_s ?? job.duration_s} s left`
    };
  }
  if (job.status === "applying" && job.sub_phase !== "refresh" && job.writes_total > 0) {
    return {
      fraction: clamp01(job.writes_done / job.writes_total),
      label: `${job.writes_done} of ${job.writes_total}`
    };
  }
  return { fraction: null, label: "" };
}
function canStop(job) {
  if (!job || job.kind !== "calibrate" || job.cancel_requested) return false;
  return job.status === "preparing" || job.status === "sampling" || job.status === "applying";
}
function canStart(payload, online, backgroundOn = ((_b) => (_b = payload == null ? void 0 : payload.entities) == null ? void 0 : _b.background_status_on)() ?? false) {
  if (!online || !(payload == null ? void 0 : payload.entities)) return false;
  if (payload.job) return false;
  if (!payload.entities.engineering_mode) return false;
  return !backgroundOn;
}
function num(v2) {
  if (v2 === null || v2 === void 0) return "";
  return String(Math.round(v2 * 10) / 10);
}
function peakText(ch) {
  if (ch.peak === null || ch.peak === void 0) return "";
  return ch.flags.includes("spike") ? `${num(ch.peak)} (spike seen)` : num(ch.peak);
}
function thresholdText(ch, preview) {
  if (ch.skipped === "not selected") {
    return ch.old === null ? "(not selected)" : `${num(ch.old)} (not selected)`;
  }
  if (ch.skipped) return `skipped: ${ch.skipped}`;
  if (ch.new === null || ch.new === void 0) return "no data";
  if (ch.written && ch.confirmed === false && ch.actual === null) {
    return "not confirmed (radar offline)";
  }
  const off = ch.flags.includes("off");
  const changed = ch.old === null || Math.abs(ch.new - ch.old) > TOLERANCE;
  if (!changed) return off ? `${num(ch.new)} (off)` : `${num(ch.old)} (unchanged)`;
  const arrow = `${num(ch.old)} → ${num(ch.new)}`;
  if (preview) {
    return off ? `${arrow} (off, would set)` : `${arrow} (would set)`;
  }
  if (ch.written && ch.confirmed === false) {
    return off ? `${arrow} (off, not confirmed)` : `${arrow} (not confirmed)`;
  }
  return off ? `${arrow} (off)` : arrow;
}
function cell(ch, preview) {
  return { peak: peakText(ch), text: thresholdText(ch, preview), flags: [...ch.flags] };
}
function rowUnused(gate) {
  const sampled = [gate.move, gate.still].filter((ch) => ch.skipped !== "not selected");
  return sampled.length > 0 && sampled.every((ch) => ch.flags.includes("unused"));
}
function resultRows(result) {
  const preview = result.outcome === "preview";
  return (result.gates ?? []).map((g2) => ({
    gate: g2.gate,
    label: `G${g2.gate}`,
    move: cell(g2.move, preview),
    still: cell(g2.still, preview),
    unused: rowUnused(g2)
  }));
}
function gateList(gates) {
  return gates.map((g2) => `G${g2}`).join(", ");
}
function unusedFootnote(result) {
  const gates = result.gates ?? [];
  const lines = [];
  if (result.profile === "ld2412") {
    const flagged = gates.filter(
      (g2) => g2.move.flags.includes("unused") || g2.still.flags.includes("unused")
    );
    const min = result.min_gate ?? null;
    const max = result.max_gate ?? null;
    const below = flagged.filter((g2) => min !== null && g2.gate < min).map((g2) => g2.gate);
    const beyond = flagged.filter((g2) => max !== null && g2.gate > max).map((g2) => g2.gate);
    if (below.length) lines.push(`${gateList(below)}: not used (below Min Gate ${min})`);
    if (beyond.length) lines.push(`${gateList(beyond)}: not used (beyond Max Gate ${max})`);
    return lines;
  }
  const move = gates.filter((g2) => g2.move.flags.includes("unused")).map((g2) => g2.gate);
  const still = gates.filter((g2) => g2.still.flags.includes("unused")).map((g2) => g2.gate);
  if (move.length) {
    lines.push(`${gateList(move)}: not used (beyond Max Move Gate ${result.max_move_gate ?? "?"})`);
  }
  if (still.length) {
    lines.push(`${gateList(still)}: not used (beyond Max Still Gate ${result.max_still_gate ?? "?"})`);
  }
  return lines;
}
function channelLabel(result, entityId) {
  for (const g2 of result.gates ?? []) {
    if (g2.move.entity_id === entityId) return `G${g2.gate} move`;
    if (g2.still.entity_id === entityId) return `G${g2.gate} still`;
  }
  return entityId;
}
function unverifiedLine(result) {
  const entries = result.unverified ?? [];
  if (entries.length === 0) return null;
  const parts = entries.map((e2) => {
    const label = channelLabel(result, e2.entity_id);
    if (e2.actual === null || e2.actual === void 0) {
      return `${label} could not be read (radar offline)`;
    }
    return `${label} still reports ${num(e2.actual)} (asked for ${num(e2.asked)})`;
  });
  return `${plural(entries.length, "value")} could not be confirmed: ${parts.join(", ")}. Check the Move / Still Thresholds cards.`;
}
function warningLines(result) {
  const lines = [];
  const warnings = result.warnings ?? [];
  for (const code of warnings) {
    if (code === "presence") {
      const pct = Math.round((result.presence_fraction ?? 0) * 100);
      lines.push(
        `The radar reported someone present for ${pct}% of the listen. If someone was in the room, even sitting still, press Undo and run it again.`
      );
    } else if (code === "radar_unavailable") {
      lines.push(
        "The radar was unavailable for part of the listen; gates with too few readings were left as they were."
      );
    } else if (code === "unverified") {
      const line = unverifiedLine(result);
      if (line) lines.push(line);
    } else if (code === "gate_off") {
      for (const entry of result.gates_off ?? []) {
        lines.push(
          `G${entry.gate} ${entry.channel} is now off (its background peaked at ${num(entry.peak)}). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty.`
        );
      }
    }
  }
  if (!warnings.includes("unverified") && result.kind === "restore") {
    const line = unverifiedLine(result);
    if (line) lines.push(line);
  }
  return lines;
}
function undoLabel(snapshots, now = /* @__PURE__ */ new Date()) {
  const newest = snapshots[0];
  if (!newest) return NOTHING_TO_RESTORE;
  return `Undo (restore ${formatTime(newest.taken_at, now)} values)`;
}
function changedOfTotal(result, verb = "changed") {
  const changed = result.changed ?? 0;
  const total = changed + (result.unchanged ?? 0);
  return `${changed} of ${total} thresholds ${verb}`;
}
function cancelledLine(result) {
  const writes = result.writes_done ?? 0;
  if (writes === 0) return "Stopped. Nothing was changed.";
  return `Stopped after ${writes} of ${result.writes_total ?? writes} values were written. Undo restores the saved values.`;
}
function summaryLine(result, now = /* @__PURE__ */ new Date()) {
  if (result.status === "failed" || result.outcome === "failed") return failureLine(result);
  if (result.outcome === "cancelled") return cancelledLine(result);
  const when = formatTime(result.finished_at, now);
  if (result.kind === "restore") {
    const restored = result.restored ?? 0;
    const unchanged = result.unchanged ?? 0;
    return `Restored ${plural(restored, "value")} at ${when}, ${unchanged} unchanged.`;
  }
  const samples = plural(result.samples ?? 0, "sample");
  if (result.outcome === "preview") {
    return `Previewed at ${when} from ${samples}. ${changedOfTotal(result, "would change")}.`;
  }
  return `Calibrated at ${when} from ${samples}. ${changedOfTotal(result)}.`;
}
function footerLine(result) {
  const when = formatDayTime(result.finished_at);
  const job = result.kind === "restore" ? "restore" : "calibration";
  switch (result.outcome) {
    case "applied":
    case "partial":
      return `Last calibrated ${when}, ${changedOfTotal(result)}.`;
    case "restored":
      return `Last restored ${when}.`;
    case "preview":
      return `Last previewed ${when}.`;
    case "cancelled":
      return `Last ${job} ${when} was stopped.`;
    default:
      return `Last ${job} ${when} failed.`;
  }
}
function resultHeading(result) {
  if (result.outcome === "partial") {
    const n3 = (result.unverified ?? []).length;
    return `Thresholds updated, ${n3} could not be confirmed`;
  }
  return "Thresholds updated";
}
const SAYS_NOTHING_CHANGED = /nothing was changed/i;
function failureLine(result) {
  var _a2;
  const message = ((_a2 = result.error) == null ? void 0 : _a2.message) ?? "Unknown error.";
  const prefix = result.kind === "restore" ? "Restore failed: " : "Calibration failed: ";
  const writes = result.writes_done ?? 0;
  if (writes === 0 && !SAYS_NOTHING_CHANGED.test(message)) {
    return `${prefix}${message} Nothing was changed.`;
  }
  return `${prefix}${message}`;
}
function offersUndo(result) {
  return (result.writes_done ?? 0) > 0 && !!result.snapshot_id;
}
function restoreSource(result, snapshots) {
  const named = result.restored_from;
  if ((named == null ? void 0 : named.id) || (named == null ? void 0 : named.taken_at)) return named;
  if (result.snapshot_id) {
    const index = snapshots.findIndex((s2) => s2.id === result.snapshot_id);
    const older = index >= 0 ? snapshots[index + 1] : void 0;
    return older ? { id: older.id, taken_at: older.taken_at } : null;
  }
  const newest = snapshots[0];
  return newest ? { id: newest.id, taken_at: newest.taken_at } : null;
}
function restoredLine(result, snapshots, now = /* @__PURE__ */ new Date()) {
  var _a2;
  const takenAt = (_a2 = restoreSource(result, snapshots)) == null ? void 0 : _a2.taken_at;
  if (!takenAt) return "Restored the saved thresholds.";
  return `Restored the thresholds from ${formatTime(takenAt, now)}.`;
}
function missingLine(result) {
  const missing = result.missing ?? [];
  return missing.length ? `Not found any more: ${missing.join(", ")}.` : null;
}
function restoreSummaryLines(result) {
  const lines = [summaryLine(result)];
  const missing = missingLine(result);
  if (missing) lines.push(missing);
  return lines;
}
function isFactoryThresholds(hass, map, profile, snapshots = []) {
  if (profile !== "ld2410" || snapshots.length > 0) return false;
  const table = LD2410_FACTORY_THRESHOLDS;
  const matches = (ids, expected) => {
    var _a2;
    if (expected.length === 0) return false;
    for (let i2 = 0; i2 < expected.length; i2++) {
      const id = ids[i2];
      if (!id) return false;
      const state = (_a2 = hass.states[id]) == null ? void 0 : _a2.state;
      if (state === void 0) return false;
      const value = parseFloat(state);
      if (!Number.isFinite(value) || value !== expected[i2]) return false;
    }
    return true;
  };
  return matches(map.move_threshold, table.move) && matches(map.still_threshold, table.still);
}
const INITIAL_LOCAL_STATE = {
  observedFinish: null,
  lastJobId: null,
  lastJobTerminal: false
};
function nextLocalState(prev, payload) {
  var _a2;
  const job = payload.job;
  if (job) {
    const terminal = isTerminal(job.status);
    return {
      observedFinish: terminal ? job.job_id : prev.observedFinish,
      lastJobId: job.job_id,
      lastJobTerminal: terminal
    };
  }
  let observed = prev.observedFinish;
  if (prev.lastJobId !== null && !prev.lastJobTerminal && ((_a2 = payload.last_result) == null ? void 0 : _a2.job_id) === prev.lastJobId) {
    observed = prev.lastJobId;
  }
  return { observedFinish: observed, lastJobId: null, lastJobTerminal: false };
}
function showsResultView(local, payload) {
  var _a2;
  if (local.observedFinish === null) return false;
  if (payload.job && !isTerminal(payload.job.status)) return false;
  return ((_a2 = payload.last_result) == null ? void 0 : _a2.job_id) === local.observedFinish;
}
var __defProp = Object.defineProperty;
var __decorateClass = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
    if (decorator = decorators[i2])
      result = decorator(target, key, result) || result;
  if (result) __defProp(target, key, result);
  return result;
};
const CALIBRATE_CARD_TAG = "apollo-radar-calibrate-card";
const DEFAULT_TITLE = "Auto-calibrate";
const PRIMARY_LABEL = "Calibrate with empty room";
const NO_DEVICE_HINT = "Add device_id to this card's configuration to enable auto-calibration.";
const OFFLINE_LINE = "Radar is offline. Calibration needs the radar online and its gate entities enabled.";
const STILL_LOADING = "Apollo mmWave is still loading...";
const NOT_LOADED = "Apollo mmWave is not loaded, so calibration is unavailable.";
const PREVIEW_HELPER = "Computes new thresholds without changing any of them. Radar Engineering Mode is still turned on for the listen.";
const FACTORY_HINT = "These look like factory thresholds. Calibrating sets them for your room.";
function safeUnsubscribe(unsubscribe) {
  try {
    const result = unsubscribe();
    if (result && typeof result.catch === "function") {
      result.catch(() => void 0);
    }
  } catch {
  }
}
const _ApolloRadarCalibrateCard = class _ApolloRadarCalibrateCard extends i {
  constructor() {
    super(...arguments);
    this._local = INITIAL_LOCAL_STATE;
    this._loadState = "loading";
    this._loadError = "";
    this._showLastResult = false;
    this._unsubscribe = null;
    this._serial = 0;
    this._pending = false;
    this._retryTimer = null;
    this._retryIndex = 0;
    this._onReady = () => this._reopen();
    this._onDisconnected = () => this._cancelRetry();
    this._entryFeed = null;
    this._entryFeedSerial = 0;
    this._lastJobApply = null;
  }
  setConfig(config) {
    this._config = config;
  }
  getCardSize() {
    return 6;
  }
  static getStubConfig() {
    return { type: `custom:${CALIBRATE_CARD_TAG}` };
  }
  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  connectedCallback() {
    super.connectedCallback();
    this._attachConnectionListeners();
    this._open();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._detachConnectionListeners();
    this._closeEntryFeed();
    this._close();
  }
  /** Skip the hass ticks (most of them) that touch none of our entities. */
  shouldUpdate(changed) {
    if (changed.size !== 1 || !changed.has("hass")) return true;
    const oldHass = changed.get("hass");
    if (!oldHass || !this.hass || !this._config) return true;
    if (oldHass.entities !== this.hass.entities || oldHass.devices !== this.hass.devices || oldHass.connection !== this.hass.connection) {
      return true;
    }
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return resolvedStatesChanged(oldHass, this.hass, this._watchedIds());
  }
  willUpdate(changed) {
    if (!this.hass || !this._config) return;
    if (!changed.has("hass") && !changed.has("_config")) return;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    const deviceId = resolvedDeviceId(this.hass, this._config, this._resolved.map);
    this._attachConnectionListeners();
    if (deviceId !== this._deviceId) {
      this._deviceId = deviceId;
      this._payload = void 0;
      this._local = INITIAL_LOCAL_STATE;
      this._failure = void 0;
      this._stopError = void 0;
      this._turnOffError = void 0;
      this._lastJobApply = null;
      this._showLastResult = false;
      this._retryIndex = 0;
      this._loadState = "loading";
      this._close();
    }
    this._open();
  }
  /** The entity ids whose state changes re-render the card. */
  _watchedIds() {
    var _a2, _b;
    const m2 = (_a2 = this._resolved) == null ? void 0 : _a2.map;
    if (!m2) return [];
    const entities = (_b = this._payload) == null ? void 0 : _b.entities;
    return [
      m2.engineering_mode,
      ...m2.move_threshold,
      ...m2.still_threshold,
      m2.radar_target,
      m2.background_correction_status,
      entities == null ? void 0 : entities.engineering_mode,
      entities == null ? void 0 : entities.background_status
    ].filter((id) => !!id);
  }
  _apiHass() {
    var _a2;
    const h2 = this.hass;
    if (!(h2 == null ? void 0 : h2.callService) || !((_a2 = h2.connection) == null ? void 0 : _a2.subscribeMessage)) return void 0;
    return h2;
  }
  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------
  _open() {
    this._openEntryFeed();
    if (!this.isConnected || this._unsubscribe || this._pending || this._retryTimer) return;
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    const serial = ++this._serial;
    this._pending = true;
    subscribeCalibration(hass, deviceId, (payload) => {
      if (serial !== this._serial) return;
      this._applyPayload(payload);
    }).then(
      (unsubscribe) => {
        if (serial !== this._serial) {
          safeUnsubscribe(unsubscribe);
          return;
        }
        this._pending = false;
        this._unsubscribe = unsubscribe;
        this._retryIndex = 0;
        if (this._loadState !== "idle") this._loadState = this._payload ? "idle" : "loading";
      },
      (error) => {
        if (serial !== this._serial) return;
        this._pending = false;
        this._failOpen(error);
      }
    );
  }
  _failOpen(error) {
    const code = error == null ? void 0 : error.code;
    if (code === ERR_NOT_LOADED && this._retryIndex < CALIBRATION_RETRY_DELAYS_MS.length) {
      const delay = CALIBRATION_RETRY_DELAYS_MS[this._retryIndex];
      this._retryIndex += 1;
      this._loadState = "retrying";
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        this._open();
      }, delay);
      return;
    }
    this._loadState = code === ERR_NOT_LOADED ? "not_loaded" : "error";
    this._loadError = describeError(error);
  }
  _close() {
    this._serial += 1;
    this._pending = false;
    this._cancelRetry();
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    if (unsubscribe) safeUnsubscribe(unsubscribe);
  }
  _cancelRetry() {
    if (this._retryTimer === null) return;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
  }
  /**
   * Re-run the subscribe on the connection's `ready`. The websocket library
   * re-sends subscriptions on reconnect, but when that re-subscribe is
   * rejected (HA restarted and apollo_mmwave is not loaded yet, the normal
   * order after the one restart that matters) it is dropped silently, the
   * original promise having long been resolved.
   */
  _reopen() {
    this._retryIndex = 0;
    this._close();
    this._open();
  }
  /**
   * Watch the config entry feed so an integration reload reopens the
   * subscription. Unloading the entry closes it server side without telling
   * the client, and neither `ready` nor `disconnected` fires on a reload, so
   * without this an open card would sit on its last payload until a page
   * reload. SPEC NOTE: the spec names only the `ready` handling; this is the
   * zone card's established `subscribeEntryLoads` pattern for the same
   * failure, copied into `calibration/api.ts` rather than imported.
   */
  _openEntryFeed() {
    const hass = this._apiHass();
    const conn = hass == null ? void 0 : hass.connection;
    if (!this.isConnected || !hass || !conn || !this._deviceId) return;
    if (this._entryFeedConnection === conn) return;
    this._closeEntryFeed();
    this._entryFeedConnection = conn;
    const serial = ++this._entryFeedSerial;
    void subscribeEntryLoads(hass, () => {
      if (serial === this._entryFeedSerial) this._reopen();
    }).then((unsubscribe) => {
      if (serial !== this._entryFeedSerial) {
        if (unsubscribe) safeUnsubscribe(unsubscribe);
        return;
      }
      this._entryFeed = unsubscribe;
    });
  }
  _closeEntryFeed() {
    this._entryFeedSerial += 1;
    this._entryFeedConnection = void 0;
    const unsubscribe = this._entryFeed;
    this._entryFeed = null;
    if (unsubscribe) safeUnsubscribe(unsubscribe);
  }
  _retryNow() {
    this._retryIndex = 0;
    this._loadState = "loading";
    this._close();
    this._open();
  }
  _attachConnectionListeners() {
    var _a2;
    const conn = (_a2 = this.hass) == null ? void 0 : _a2.connection;
    if (!this.isConnected || !conn || conn === this._listenedConnection) return;
    this._detachConnectionListeners();
    if (!conn.addEventListener) return;
    conn.addEventListener("ready", this._onReady);
    conn.addEventListener("disconnected", this._onDisconnected);
    this._listenedConnection = conn;
  }
  _detachConnectionListeners() {
    const conn = this._listenedConnection;
    this._listenedConnection = void 0;
    if (!(conn == null ? void 0 : conn.removeEventListener)) return;
    conn.removeEventListener("ready", this._onReady);
    conn.removeEventListener("disconnected", this._onDisconnected);
  }
  _applyPayload(payload) {
    var _a2, _b;
    const previousJobId = (_b = (_a2 = this._payload) == null ? void 0 : _a2.job) == null ? void 0 : _b.job_id;
    this._local = nextLocalState(this._local, payload);
    this._payload = payload;
    this._loadState = "idle";
    const job = payload.job;
    if (job) this._lastJobApply = { jobId: job.job_id, apply: job.apply };
    if (job && !isTerminal(job.status)) {
      this._failure = void 0;
    }
    if (!job || isTerminal(job.status) || job.job_id !== previousJobId) {
      this._stopError = void 0;
    }
  }
  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  _start(apply) {
    var _a2;
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    this._failure = void 0;
    this._showLastResult = false;
    this._local = { ...this._local, observedFinish: null };
    const opts = { ...((_a2 = this._config) == null ? void 0 : _a2.calibration) ?? {} };
    if (!apply) opts.apply = false;
    startCalibration(hass, deviceId, opts).catch(
      (error) => this._showServiceFailure("Calibration failed: ", error, () => this._start(apply))
    );
  }
  /** Render a rejected start or restore as the failed view, in the words of
   *  the backend's translated exception message. */
  async _showServiceFailure(prefix, error, retry) {
    const deviceId = this._deviceId;
    const message = await describeServiceError(this.hass ?? {}, error);
    if (deviceId !== this._deviceId) return;
    this._failure = { prefix, message, retry };
  }
  _stop() {
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    this._stopError = void 0;
    cancelCalibration(hass, deviceId).catch(async (error) => {
      const message = await describeServiceError(this.hass ?? {}, error);
      if (deviceId !== this._deviceId) return;
      this._stopError = `Could not stop the calibration: ${message}`;
    });
  }
  /** Restore the newest snapshot (what every Undo label names), or the one a
   *  failed restore was writing back when "Try again" repeats it. */
  _undo(snapshotId) {
    const hass = this._apiHass();
    const deviceId = this._deviceId;
    if (!hass || !deviceId) return;
    this._failure = void 0;
    this._showLastResult = false;
    restoreThresholds(hass, deviceId, snapshotId).catch(
      (error) => this._showServiceFailure("Restore failed: ", error, () => this._undo(snapshotId))
    );
  }
  _turnOff() {
    const hass = this._apiHass();
    const switchId = this._engineeringSwitchId();
    if (!hass || !switchId) return;
    const deviceId = this._deviceId;
    this._turnOffError = void 0;
    turnEngineeringMode(hass, switchId).catch(async (error) => {
      const message = await describeServiceError(this.hass ?? {}, error);
      if (deviceId !== this._deviceId) return;
      this._turnOffError = `Could not turn Radar Engineering Mode off: ${message}`;
    });
  }
  /** "Close": back to Idle from a result or a failure. */
  _closeResult() {
    this._failure = void 0;
    this._local = { ...this._local, observedFinish: null };
  }
  // ---------------------------------------------------------------------------
  // Derived facts
  // ---------------------------------------------------------------------------
  _profileKey() {
    var _a2, _b, _c, _d;
    return ((_b = (_a2 = this._resolved) == null ? void 0 : _a2.profile) == null ? void 0 : _b.key) ?? ((_d = (_c = this._payload) == null ? void 0 : _c.entities) == null ? void 0 : _d.profile);
  }
  _engineeringSwitchId() {
    var _a2, _b, _c;
    return ((_a2 = this._resolved) == null ? void 0 : _a2.map.engineering_mode) ?? ((_c = (_b = this._payload) == null ? void 0 : _b.entities) == null ? void 0 : _c.engineering_mode) ?? void 0;
  }
  /** Live switch state first; the payload's copy when HA has no state. */
  _engineeringOn() {
    var _a2, _b, _c;
    const id = this._engineeringSwitchId();
    const live = id && this.hass ? (_a2 = this.hass.states[id]) == null ? void 0 : _a2.state : void 0;
    if (live !== void 0) return live === "on";
    return !!((_c = (_b = this._payload) == null ? void 0 : _b.entities) == null ? void 0 : _c.engineering_mode_on);
  }
  /** Live status first, as for the switch: the payload's copy is only as
   *  fresh as the last job push. */
  _backgroundOn() {
    var _a2, _b, _c, _d, _e, _f;
    const id = ((_b = (_a2 = this._payload) == null ? void 0 : _a2.entities) == null ? void 0 : _b.background_status) ?? ((_c = this._resolved) == null ? void 0 : _c.map.background_correction_status);
    const live = id && this.hass ? (_d = this.hass.states[id]) == null ? void 0 : _d.state : void 0;
    if (live !== void 0) return live === "on";
    return !!((_f = (_e = this._payload) == null ? void 0 : _e.entities) == null ? void 0 : _f.background_status_on);
  }
  _online() {
    var _a2;
    if (!this.hass || !this._resolved) return false;
    if (!anyResolved(this.hass, this._resolved.ids)) return false;
    const id = this._engineeringSwitchId();
    const state2 = id ? (_a2 = this.hass.states[id]) == null ? void 0 : _a2.state : void 0;
    return state2 !== void 0 && state2 !== "unavailable";
  }
  // ---------------------------------------------------------------------------
  // Render
  //
  // Every helper returns a template whose bindings sit inside an element, never
  // at the template root: happy-dom (the test DOM) mis-clones root-level
  // child-part markers, and browsers do not care either way.
  // ---------------------------------------------------------------------------
  render() {
    if (!this.hass || !this._config) return A;
    this._resolved = resolveRadar(this._resolved, this.hass, this._config);
    return b`
      <ha-card .header=${this._config.title ?? DEFAULT_TITLE}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `;
  }
  _renderSubtitle() {
    var _a2, _b, _c;
    const deviceId = this._deviceId;
    if (!deviceId || !this.hass) return A;
    const label = ((_b = (_a2 = this._resolved) == null ? void 0 : _a2.profile) == null ? void 0 : _b.label) ?? ((_c = this._profileKey()) == null ? void 0 : _c.toUpperCase());
    const device = this.hass.devices[deviceId];
    const name = (device == null ? void 0 : device.name_by_user) || (device == null ? void 0 : device.name);
    if (!label && !name) return A;
    return b`<div class="subtitle">${[label, name].filter(Boolean).join(" · ")}</div>`;
  }
  _renderBody() {
    var _a2;
    if (!this._deviceId) return b`<p class="hint">${NO_DEVICE_HINT}</p>`;
    if (this._loadState === "retrying") {
      return b`<div class="status" aria-live="polite"><p>${STILL_LOADING}</p></div>`;
    }
    if (this._loadState === "not_loaded" || this._loadState === "error") {
      const text = this._loadState === "not_loaded" ? NOT_LOADED : this._loadError;
      return b`
        <div class="section">
          <div class="status" aria-live="polite"><p class="error">${text}</p></div>
          <div class="buttons">
            <button type="button" class="secondary" @click=${this._retryNow}>Retry</button>
          </div>
        </div>
      `;
    }
    const payload = this._payload;
    if (!payload) return b`<div class="status" aria-live="polite"><p class="hint">Loading...</p></div>`;
    const job = payload.job;
    if (job && !isTerminal(job.status)) return this._renderRunning(job);
    if (this._failure) return this._renderFailure(this._failure, payload);
    if (job && ((_a2 = payload.last_result) == null ? void 0 : _a2.job_id) !== job.job_id) {
      return this._renderFinishing();
    }
    if (showsResultView(this._local, payload) && payload.last_result) {
      return this._renderResult(payload.last_result, payload);
    }
    return this._renderIdle(payload);
  }
  // --- running --------------------------------------------------------------
  _renderRunning(job) {
    const lines = phaseLabel(job, this._profileKey());
    const { phase, detail } = phaseHeadline(job);
    const stoppable = job.kind === "calibrate" && (job.status === "preparing" || job.status === "sampling" || job.status === "applying");
    return b`
      <div class="section">
        <div class="status">
          <p class="headline"><span class="phase" aria-live="polite">${phase}</span>${detail ? ` ${detail}` : ""}</p>
          ${lines.slice(1).map((line) => b`<p>${line}</p>`)}
        </div>
        ${this._renderBar(job)}
        ${stoppable ? b`
              <div class="buttons">
                <button
                  type="button"
                  class="secondary"
                  ?disabled=${!canStop(job)}
                  @click=${this._stop}
                >
                  ${job.cancel_requested ? "Stopping..." : "Stop"}
                </button>
              </div>
            ` : A}
        ${this._stopError ? b`<p class="error" role="alert">${this._stopError}</p>` : A}
      </div>
    `;
  }
  _renderBar(job) {
    const { fraction, label } = progress(job);
    const percent = fraction === null ? 100 : Math.round(fraction * 100);
    return b`
      <div
        class="bar ${fraction === null ? "indeterminate" : ""}"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${fraction === null ? A : percent}
        aria-label=${label || A}
      >
        <div class="fill" style="width:${percent}%"></div>
      </div>
    `;
  }
  _renderFinishing() {
    return b`
      <div class="section">
        <div class="status" aria-live="polite"><p class="headline">Finishing...</p></div>
        <div class="bar indeterminate" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="fill" style="width:100%"></div>
        </div>
      </div>
    `;
  }
  // --- failure from a rejected service call ---------------------------------
  // SPEC NOTE: the spec lists only "Try again" for the failed state. A
  // refusal such as not_allowed fails the same way every time, so every
  // failure and result view also has a "Close" back to Idle (footer, Undo and
  // "Show last result"), and the interrupted banner renders above them all.
  _closeButton() {
    return b`<button type="button" class="text" @click=${this._closeResult}>Close</button>`;
  }
  _renderFailure(failure, payload) {
    return b`
      <div class="section">
        ${this._renderBanner(payload)}
        <div class="status" aria-live="polite">
          <p class="error">${failure.prefix}${failure.message}</p>
        </div>
        <div class="buttons">
          <button type="button" class="primary" @click=${failure.retry}>Try again</button>
          ${this._closeButton()}
        </div>
      </div>
    `;
  }
  // --- finished job ---------------------------------------------------------
  _renderResult(result, payload) {
    const snapshots = payload.snapshots ?? [];
    const banner = this._renderBanner(payload);
    const undo = snapshots.length ? b`<button type="button" class="secondary" @click=${() => this._undo()}>
          ${undoLabel(snapshots)}
        </button>` : A;
    const again = (label) => b`<button type="button" class="primary" @click=${() => this._start(true)}>${label}</button>`;
    if (result.status === "failed" || result.outcome === "failed") {
      return b`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite"><p class="error">${failureLine(result)}</p></div>
          <div class="buttons">
            ${offersUndo(result) ? undo : A} ${this._renderTryAgain(result, snapshots)}
            ${this._closeButton()}
          </div>
        </div>
      `;
    }
    if (result.outcome === "cancelled") {
      const writes = result.writes_done ?? 0;
      return b`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite"><p>${cancelledLine(result)}</p></div>
          <div class="buttons">
            ${writes > 0 ? undo : A} ${again(PRIMARY_LABEL)} ${this._closeButton()}
          </div>
        </div>
      `;
    }
    if (result.kind === "restore") {
      const missing = missingLine(result);
      return b`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite">
            <p class="headline">${restoredLine(result, snapshots)}</p>
            ${missing ? b`<p>${missing}</p>` : A}
            ${warningLines(result).map((line) => b`<p class="warning">${line}</p>`)}
          </div>
          ${this._renderIdleBody(payload)}
          <div class="buttons">${undo} ${again(PRIMARY_LABEL)}</div>
        </div>
      `;
    }
    if (result.outcome === "preview") {
      return b`
        <div class="section">
          ${banner}
          <div class="status" aria-live="polite">
            <p class="headline">Preview: no threshold was changed.</p>
            <p>These are the thresholds calibration would set:</p>
          </div>
          ${this._renderTable(result)}
          ${warningLines(result).map((line) => b`<p class="warning">${line}</p>`)}
          <div class="buttons">${again("Calibrate and apply")} ${this._closeButton()}</div>
        </div>
      `;
    }
    return b`
      <div class="section">
        ${banner}
        <div class="status" aria-live="polite">
          <p class="headline">${resultHeading(result)}</p>
          <p>${summaryLine(result)}</p>
        </div>
        ${this._renderTable(result)}
        ${warningLines(result).map((line) => b`<p class="warning">${line}</p>`)}
        <p>${WALK_AROUND_LINE}</p>
        <div class="buttons">${undo} ${again("Calibrate again")} ${this._closeButton()}</div>
      </div>
    `;
  }
  /**
   * "Try again" repeats the job that failed. A calibration restarts with the
   * same `apply` (a failed preview previews again). A restore writes back the
   * snapshot it was restoring, by id: once its redo snapshot is saved that is
   * the newest, and restoring the newest would put back the very values the
   * user was undoing. When the source cannot be told the button is left out
   * (Close and Undo remain).
   */
  _renderTryAgain(result, snapshots) {
    let retry;
    if (result.kind === "restore") {
      const source = restoreSource(result, snapshots);
      if (!(source == null ? void 0 : source.id)) return A;
      const id = source.id;
      retry = () => this._undo(id);
    } else {
      const seen = this._lastJobApply;
      const apply = seen && seen.jobId === result.job_id ? seen.apply : true;
      retry = () => this._start(apply);
    }
    return b`<button type="button" class="primary" @click=${retry}>Try again</button>`;
  }
  _renderTable(result) {
    const rows = resultRows(result);
    const footnotes = unusedFootnote(result);
    const cellClass = (flags) => flags.includes("unused") ? "unused" : "";
    const renderRow = (row2) => b`
      <tr class=${row2.unused ? "unused" : ""}>
        <th scope="row">${row2.label}</th>
        <td class=${cellClass(row2.move.flags)}>${row2.move.peak}</td>
        <td class=${cellClass(row2.move.flags)}>${row2.move.text}</td>
        <td class=${cellClass(row2.still.flags)}>${row2.still.peak}</td>
        <td class=${cellClass(row2.still.flags)}>${row2.still.text}</td>
      </tr>
    `;
    return b`
      <div class="result">
        <div class="table-wrap">
          <table>
          <thead>
            <tr>
              <th scope="col">Gate</th>
              <th scope="col">Move peak</th>
              <th scope="col">Move threshold</th>
              <th scope="col">Still peak</th>
              <th scope="col">Still threshold</th>
            </tr>
          </thead>
            <tbody>
              ${rows.map(renderRow)}
            </tbody>
          </table>
        </div>
        ${footnotes.map((line) => b`<p class="footnote">${line}</p>`)}
      </div>
    `;
  }
  // --- idle -----------------------------------------------------------------
  _renderIdle(payload) {
    const online = this._online();
    const snapshots = payload.snapshots ?? [];
    return b`
      <div class="section">
        ${this._renderBanner(payload)}
        ${online ? this._renderIdleBody(payload) : b`<div class="status" aria-live="polite"><p>${OFFLINE_LINE}</p></div>`}
        ${this._renderIdleButtons(payload, online)}
        ${this._renderFooter(payload, snapshots)}
      </div>
    `;
  }
  _renderIdleBody(payload) {
    var _a2, _b, _c, _d;
    const settle = ((_b = (_a2 = this._config) == null ? void 0 : _a2.calibration) == null ? void 0 : _b.settle_s) ?? DEFAULT_SETTLE_S;
    const duration = ((_d = (_c = this._config) == null ? void 0 : _c.calibration) == null ? void 0 : _d.duration_s) ?? DEFAULT_DURATION_S;
    const ld2412 = this._profileKey() === "ld2412";
    const engineeringBullet = this._engineeringOn() ? "Radar Engineering Mode is already on and will stay on." : "Home Assistant turns Radar Engineering Mode on for the listen and back off afterwards.";
    const factory = this.hass && this._resolved ? isFactoryThresholds(this.hass, this._resolved.map, this._profileKey(), payload.snapshots ?? []) : false;
    return b`
      <div class="idle-body">
        <p>${idleSentence(settle, duration)}</p>
        <ul>
        <li>Nobody in the radar's view: people, pets, robot vacuums.</li>
        <li>
          Fans, curtains and plants that normally move are part of the background. Leave them
          as they usually are.
        </li>
        <li>${engineeringBullet}</li>
        ${ld2412 ? b`<li>
              LD2412: run Start Dynamic Background Correction (Controls card) first with the
              room empty and wait for its status to turn off. Calibrate afterwards.
            </li>` : A}
        ${ld2412 && this._backgroundOn() ? b`<li>
              Background correction is running on the LD2412. Wait for its status to turn off.
            </li>` : A}
        </ul>
        ${factory ? b`<p class="hint">${FACTORY_HINT}</p>` : A}
      </div>
    `;
  }
  _renderIdleButtons(payload, online) {
    const enabled = canStart(payload, online, this._backgroundOn()) && !!this._apiHass();
    return b`
      <div class="actions">
        <div class="buttons">
          <button type="button" class="primary" ?disabled=${!enabled} @click=${() => this._start(true)}>
            ${PRIMARY_LABEL}
          </button>
          <button type="button" class="text" ?disabled=${!enabled} @click=${() => this._start(false)}>
            Preview only
          </button>
        </div>
        <p class="helper">${PREVIEW_HELPER}</p>
      </div>
    `;
  }
  _renderFooter(payload, snapshots) {
    const last = payload.last_result;
    if (!snapshots.length && !last) return A;
    return b`
      <div class="footer">
        ${snapshots.length ? b`
              <div class="last">
                ${last ? b`<p>${footerLine(last)}</p>` : A}
                <div class="buttons">
                  <button type="button" class="secondary" @click=${() => this._undo()}>
                    ${undoLabel(snapshots)}
                  </button>
                </div>
              </div>
            ` : A}
        ${last ? b`
              <div class="stored-toggle">
                <div class="buttons">
                  <button
                    type="button"
                    class="text"
                    aria-expanded=${this._showLastResult ? "true" : "false"}
                    @click=${() => this._showLastResult = !this._showLastResult}
                  >
                    ${this._showLastResult ? "Hide last result" : "Show last result"}
                  </button>
                </div>
                ${this._showLastResult ? this._renderStoredResult(last) : A}
              </div>
            ` : A}
      </div>
    `;
  }
  _renderStoredResult(result) {
    if (result.status === "failed" || result.outcome === "failed") {
      return b`<div class="stored"><p class="error">${failureLine(result)}</p></div>`;
    }
    const warnings = warningLines(result).map((line) => b`<p class="warning">${line}</p>`);
    if (result.kind === "restore") {
      return b`<div class="stored">
        ${restoreSummaryLines(result).map((line) => b`<p>${line}</p>`)} ${warnings}
      </div>`;
    }
    const hasTable = (result.gates ?? []).length > 0;
    return b`<div class="stored">
      <p>${summaryLine(result)}</p>
      ${hasTable ? this._renderTable(result) : A} ${warnings}
    </div>`;
  }
  /**
   * The interrupted banner. `phase` and `left_on` are independent facts: the
   * engineering line shows while the switch reads on for either, the
   * thresholds line while the marker's phase is `applying`.
   */
  _renderBanner(payload) {
    const marker = payload.interrupted;
    if (!marker) return A;
    const switchOn = this._engineeringOn();
    const engineeringLine = switchOn && (marker.phase === "engineering" || marker.left_on);
    const thresholdsLine = marker.phase === "applying";
    if (!engineeringLine && !thresholdsLine) return A;
    const first = marker.left_on ? "The last calibration could not turn Radar Engineering Mode back off (the radar was offline)." : marker.kind === "restore" ? "A restore was interrupted by a restart." : "A calibration was interrupted by a restart.";
    const snapshots = payload.snapshots ?? [];
    const saved = snapshots.find((s2) => s2.id === marker.snapshot_id) ?? snapshots[0];
    const savedAt = saved ? formatTime(saved.taken_at) : "the start";
    return b`
      <div class="banner" role="status">
        <p>${first}</p>
        ${engineeringLine ? b`<p>
              Radar Engineering Mode may still be on.
              <button type="button" class="secondary" @click=${this._turnOff}>Turn it off</button>
            </p>` : A}
        ${engineeringLine && this._turnOffError ? b`<p class="error" role="alert">${this._turnOffError}</p>` : A}
        ${thresholdsLine ? b`<p>
              Some thresholds may have been written. Undo restores the values saved at
              ${savedAt}.
              <button type="button" class="secondary" ?disabled=${!saved} @click=${() => this._undo()}>
                Undo
              </button>
            </p>` : A}
      </div>
    `;
  }
};
_ApolloRadarCalibrateCard.styles = i$3`
    :host {
      display: block;
    }
    .wrap {
      padding: 0 16px 16px;
    }
    .subtitle {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin: -8px 0 12px;
    }
    p {
      margin: 0 0 8px;
    }
    ul {
      margin: 0 0 12px;
      padding-left: 20px;
    }
    li {
      margin: 4px 0;
    }
    .headline {
      font-weight: 500;
      font-size: 1.05em;
    }
    .hint,
    .helper,
    .footnote {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    .warning {
      color: var(--warning-color, #ff9800);
    }
    .error {
      color: var(--error-color, #db4437);
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin: 12px 0 8px;
    }
    button {
      font: inherit;
      cursor: pointer;
      border-radius: 4px;
      padding: 8px 16px;
      border: 1px solid var(--primary-color);
      background: none;
      color: var(--primary-color);
    }
    button.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-weight: 500;
    }
    button.text {
      border-color: transparent;
      padding: 8px 8px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .banner p button,
    .footer .buttons {
      margin-top: 4px;
    }
    .banner {
      border: 1px solid var(--warning-color, #ff9800);
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 12px;
    }
    .banner p button {
      margin-left: 8px;
      padding: 4px 10px;
    }
    .footer {
      border-top: 1px solid var(--divider-color, #e0e0e0);
      margin-top: 12px;
      padding-top: 8px;
      font-size: 0.95em;
    }
    .bar {
      height: 6px;
      background: var(--divider-color, #e0e0e0);
      border-radius: 3px;
      overflow: hidden;
      margin: 4px 0 12px;
    }
    .bar .fill {
      height: 100%;
      background: var(--primary-color);
      transition: width 0.5s linear;
    }
    .bar.indeterminate .fill {
      width: 40% !important;
      animation: slide 1.4s infinite ease-in-out;
    }
    @keyframes slide {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(250%);
      }
    }
    .table-wrap {
      overflow-x: auto;
      margin: 8px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9em;
    }
    th,
    td {
      text-align: left;
      padding: 4px 6px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      white-space: nowrap;
    }
    th {
      color: var(--secondary-text-color);
      font-weight: 500;
    }
    tr.unused th,
    td.unused {
      opacity: 0.55;
    }
  `;
let ApolloRadarCalibrateCard = _ApolloRadarCalibrateCard;
__decorateClass([
  n2({ attribute: false })
], ApolloRadarCalibrateCard.prototype, "hass");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_config");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_payload");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_local");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_loadState");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_loadError");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_failure");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_stopError");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_turnOffError");
__decorateClass([
  r()
], ApolloRadarCalibrateCard.prototype, "_showLastResult");
registerElement(CALIBRATE_CARD_TAG, ApolloRadarCalibrateCard);
const customCards = window.customCards = window.customCards || [];
if (!customCards.some((c2) => c2.type === CALIBRATE_CARD_TAG)) {
  customCards.push({
    type: CALIBRATE_CARD_TAG,
    name: "Apollo Radar Auto-Calibrate",
    description: "One-button empty-room calibration of every gate threshold on an Apollo MSR (LD2410) or R-PRO (LD2412), with undo.",
    documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main"
  });
}
function ld2450TargetPairs(base) {
  return [1, 2, 3].map((n3) => ({
    x: `sensor.${base}_ld2450_target_${n3}_x`,
    y: `sensor.${base}_ld2450_target_${n3}_y`
  }));
}
const TARGET_X = /(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$/;
const TARGET_Y = /(?:_ld2450)?_target_(\d+)_y(?:_\d+)?$/;
function ld2450EntityIds(hass, deviceId) {
  const ids = [];
  for (const [id, e2] of Object.entries(hass.entities)) {
    if (e2.device_id !== deviceId || !id.startsWith("sensor.")) continue;
    const oid = id.slice(id.indexOf(".") + 1);
    if (TARGET_X.test(oid) || TARGET_Y.test(oid)) ids.push(id);
  }
  return ids;
}
function hasLd2450Device(hass, deviceId) {
  for (const [id, e2] of Object.entries(hass.entities)) {
    if (e2.device_id !== deviceId || !id.startsWith("sensor.")) continue;
    if (TARGET_X.test(id.slice(id.indexOf(".") + 1))) return true;
  }
  return false;
}
function hasLd2450(hass, base) {
  return ld2450TargetPairs(base).some((p2) => p2.x in hass.states) || [1, 2, 3].some((n3) => `sensor.${base}_target_${n3}_x` in hass.states);
}
function zoneMapCard(deviceId, title) {
  return {
    type: "custom:apollo-radar-zone-map-card",
    device_id: deviceId,
    title,
    unit_display: true
  };
}
function row(entity, name) {
  return entity ? [{ entity, name }] : [];
}
function controlRows(m2) {
  return [
    ...row(m2.engineering_mode, "Radar Engineering Mode"),
    // LD2412 only: the chip's own background correction. Both slots are
    // undefined on an LD2410, so these rows simply do not appear there.
    ...row(m2.background_correction, "Start Dynamic Background Correction"),
    ...row(m2.background_correction_status, "Background Correction Running"),
    ...row(m2.bluetooth, "Bluetooth"),
    ...row(m2.restart_radar, "Restart Radar"),
    ...row(m2.factory_reset_radar, "Factory Reset Radar"),
    ...row(m2.esp_reboot, "ESP Reboot")
  ];
}
function rangeRows(m2, rangeLabels, gateSizeLabel) {
  return [
    ...row(m2.radar_timeout, "Radar Timeout"),
    ...row(m2.gate_size, gateSizeLabel),
    ...row(m2.max_move_distance, rangeLabels[0]),
    ...row(m2.max_still_distance, rangeLabels[1])
  ];
}
function zoneConfigRows(m2) {
  return [
    ...row(m2.zone_1_start, "Start Zone 1"),
    ...row(m2.end_zone_1, "End Zone 1"),
    ...row(m2.end_zone_2, "End Zone 2"),
    ...row(m2.end_zone_3, "End Zone 3")
  ];
}
function moveThresholdRows(m2) {
  const rows = [];
  for (let n3 = 0; n3 < m2.move_threshold.length; n3++) {
    rows.push(...row(m2.move_threshold[n3], `G${n3}`));
  }
  return rows;
}
function stillThresholdRows(m2) {
  const rows = [];
  for (let n3 = 0; n3 < m2.still_threshold.length; n3++) {
    rows.push(...row(m2.still_threshold[n3], `G${n3}`));
  }
  return rows;
}
function occupancyRows(m2) {
  return [
    ...row(m2.radar_target, "Radar Target"),
    ...row(m2.moving_target, "Radar Moving Target"),
    ...row(m2.still_target, "Radar Still Target"),
    ...row(m2.zone_1_occupancy, "Radar Zone 1 Occupancy"),
    ...row(m2.zone_2_occupancy, "Radar Zone 2 Occupancy"),
    ...row(m2.zone_3_occupancy, "Radar Zone 3 Occupancy")
  ];
}
function presentRows(hass, rows) {
  return rows.filter((r2) => exists(hass, r2.entity));
}
function historyEntities(m2) {
  const rows = [];
  const push = (entity, name) => {
    if (entity) rows.push({ entity, name });
  };
  push(m2.radar_target, "Detected");
  push(m2.zone_1_occupancy, "Zone 1");
  push(m2.zone_2_occupancy, "Zone 2");
  push(m2.zone_3_occupancy, "Zone 3");
  return rows;
}
function isLive(hass, entityId) {
  if (!entityId) return false;
  const state = hass.states[entityId];
  return state !== void 0 && state.state !== "unavailable";
}
function hasLiveRadarEvidence(hass, deviceId, registryMatched) {
  const m2 = entityMapFromDevice(hass, deviceId);
  const radarIds = [];
  if (m2) {
    radarIds.push(
      m2.engineering_mode,
      m2.radar_timeout,
      m2.max_move_distance,
      m2.max_still_distance,
      m2.radar_target,
      m2.moving_target,
      m2.still_target,
      m2.detection_distance,
      ...m2.move_threshold,
      ...m2.still_threshold,
      ...m2.move_energy,
      ...m2.still_energy
    );
  }
  radarIds.push(...ld2450EntityIds(hass, deviceId));
  if (radarIds.some((id) => isLive(hass, id))) return true;
  if (radarIds.some((id) => id !== void 0)) return false;
  return registryMatched && Object.entries(hass.entities).some(
    ([id, e2]) => e2.device_id === deviceId && isLive(hass, id)
  );
}
function deviceFromId(hass, deviceId, forced = false) {
  const d2 = hass.devices[deviceId];
  if (forced && !d2) return void 0;
  const reg = isEsphomeDevice(hass, deviceId) ? apolloModelInfo(d2) : void 0;
  const base = baseNameFromDevice(hass, deviceId);
  if (!forced && !reg && !base) return void 0;
  const online = hasLiveRadarEvidence(hass, deviceId, !!reg);
  if (!forced && !reg && !online) return void 0;
  const profile = detectProfileFromEntities(hass, deviceId) ?? (reg == null ? void 0 : reg.profile);
  const ld2450 = hasLd2450Device(hass, deviceId) || (base ? hasLd2450(hass, base) : false) || ((reg == null ? void 0 : reg.ld2450) ?? false);
  if (!forced && !profile && !ld2450) return void 0;
  return {
    deviceId,
    // The base doubles as the view path, so a registry-matched device whose
    // entity names yield no base still needs a stable unique key.
    base: base ?? deviceId,
    name: (d2 == null ? void 0 : d2.name_by_user) || (d2 == null ? void 0 : d2.name) || base || deviceId,
    profile,
    ld2450,
    online
  };
}
function detectRadarDevices(hass) {
  const out = [];
  for (const deviceId of Object.keys(hass.devices)) {
    const dev = deviceFromId(hass, deviceId);
    if (dev) out.push(dev);
  }
  return out;
}
function strategyDevices(hass, config) {
  var _a2;
  if (config.device_id) {
    const d2 = deviceFromId(hass, config.device_id, true);
    return d2 ? [d2] : [];
  }
  if ((_a2 = config.devices) == null ? void 0 : _a2.length) {
    return config.devices.map((id) => deviceFromId(hass, id, true)).filter((d2) => d2 !== void 0);
  }
  return detectRadarDevices(hass);
}
function entitiesCard(title, rows) {
  if (rows.length === 0) return void 0;
  return {
    type: "entities",
    title,
    show_header_toggle: false,
    entities: rows.map((r2) => ({ entity: r2.entity, name: r2.name }))
  };
}
const OFFLINE_NOTE = "\n\n**Offline right now.** Its entities are unavailable, so the cards below will fill in once it reconnects. If this radar was replaced or reflashed under a new name, delete the old device in Home Assistant to drop this tab.";
function helpCard(dev) {
  const card = helpCardBody(dev);
  if (!dev.online && (dev.profile || dev.ld2450)) {
    card.content = `${card.content}${OFFLINE_NOTE}`;
  }
  return card;
}
function helpCardBody(dev) {
  if (!dev.profile && !dev.ld2450) {
    return {
      type: "markdown",
      content: `**${dev.name}** — no radar data available right now.

The device looks offline (or exposes no recognizable radar entities). Its cards will appear here once it reports in.`
    };
  }
  if (!dev.profile) {
    return {
      type: "markdown",
      content: `**${dev.name}** — Apollo mmWave (LD2450 tracking radar).

Draw occupancy zones over the live target positions below.`
    };
  }
  const p2 = dev.profile;
  return {
    type: "markdown",
    content: `**${dev.name}**, Apollo ${p2.label} radar.

**Start here**
1. Press **Calibrate with empty room** on the Auto-calibrate card and leave the room.
2. Set how far it should look: **${p2.rangeLabels[0]} / ${p2.rangeLabels[1]}** on the Detection Range card (each gate is 0.75 m unless you changed ${p2.gateSizeLabel}).
3. Set how long presence stays on after you stop moving: **Radar Timeout**, same card.
4. Walk the room and watch the Gate Energy chart. Raise a gate's threshold if it triggers with nobody there, lower it if it misses you.

[Full tuning guide →](${p2.wikiUrl})`
  };
}
function noteCard(text) {
  return { type: "markdown", content: text };
}
function cardMap(hass, dev, distanceUnit, calibration) {
  const cards = { help: helpCard(dev) };
  if (dev.profile) {
    const profile = dev.profile;
    cards.calibrate = {
      type: "custom:apollo-radar-calibrate-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: "Auto-calibrate",
      ...calibration ? { calibration } : {}
    };
    const m2 = entityMapFromDevice(hass, dev.deviceId) ?? profile.entityMap(dev.base);
    const label = profile.label;
    const historyRows = historyEntities(m2).filter((r2) => r2.entity in hass.states);
    const range = entitiesCard(
      `${label} Detection Range`,
      presentRows(hass, rangeRows(m2, profile.rangeLabels, profile.gateSizeLabel))
    );
    const moveThr = entitiesCard(
      `${label} Move Thresholds`,
      presentRows(hass, moveThresholdRows(m2))
    );
    const stillThr = entitiesCard(
      `${label} Still Thresholds`,
      presentRows(hass, stillThresholdRows(m2))
    );
    cards.controls = entitiesCard(
      `${label} Controls`,
      presentRows(hass, controlRows(m2))
    );
    cards.range = range;
    cards.rangeNote = range ? noteCard(profile.rangeTip) : void 0;
    cards.zone = entitiesCard(
      `${label} Zone Config`,
      presentRows(hass, zoneConfigRows(m2))
    );
    cards.distance = {
      type: "custom:apollo-radar-distance-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Distances`,
      ...distanceUnit ? { distance_unit: distanceUnit } : {}
    };
    cards.gateEnergy = {
      type: "custom:apollo-radar-gate-energy-card",
      device_id: dev.deviceId,
      device_base_name: dev.base,
      title: `${label} Gate Energy`
    };
    cards.moveThr = moveThr;
    cards.stillThr = stillThr;
    cards.gateNote = moveThr || stillThr ? noteCard(profile.gateTip) : void 0;
    cards.occupancy = entitiesCard(
      `${label} Target / Occupancy`,
      presentRows(hass, occupancyRows(m2))
    );
    cards.history = historyRows.length ? {
      type: "history-graph",
      title: `${label} Occupancy History`,
      hours_to_show: 1,
      entities: historyRows
    } : void 0;
  }
  if (dev.ld2450) {
    cards.zoneHeader = dev.profile ? { type: "heading", heading: "Zone Map" } : void 0;
    cards.zoneMap = zoneMapCard(dev.deviceId, dev.name);
  }
  return cards;
}
function buildDeviceCards(hass, dev, distanceUnit, calibration) {
  const c2 = cardMap(hass, dev, distanceUnit, calibration);
  return [
    c2.help,
    c2.calibrate,
    c2.controls,
    c2.range,
    c2.rangeNote,
    c2.zone,
    c2.distance,
    c2.gateEnergy,
    c2.moveThr,
    c2.stillThr,
    c2.gateNote,
    c2.occupancy,
    c2.history,
    c2.zoneHeader,
    c2.zoneMap
  ].filter(Boolean);
}
function buildDeviceSections(hass, dev, distanceUnit, calibration) {
  const c2 = cardMap(hass, dev, distanceUnit, calibration);
  const columns = [];
  if (dev.profile) {
    const col1 = [c2.calibrate, c2.help, c2.controls, c2.zone];
    const col2 = [
      c2.distance,
      c2.range,
      c2.rangeNote
    ];
    (c2.zone ? col2 : col1).push(c2.occupancy);
    columns.push(
      col1,
      col2,
      [c2.gateEnergy, c2.moveThr, c2.gateNote],
      [c2.history, c2.stillThr]
    );
  }
  if (c2.zoneMap) {
    columns.push([c2.zoneHeader, c2.zoneMap]);
  }
  return columns.map((col) => col.filter(Boolean)).filter((col) => col.length > 0).map((cards) => ({ type: "grid", cards }));
}
function deviceView(hass, dev, distanceUnit, path = dev.base, calibration) {
  return {
    title: dev.name,
    path,
    type: "sections",
    sections: buildDeviceSections(hass, dev, distanceUnit, calibration)
  };
}
function generateViews(hass, config) {
  const used = /* @__PURE__ */ new Set();
  return strategyDevices(hass, config).map((d2) => {
    let path = d2.base;
    if (used.has(path)) path = `${d2.base}_${d2.deviceId}`;
    used.add(path);
    return deviceView(hass, d2, config.distance_unit, path, config.calibration);
  });
}
function generateSections(hass, config) {
  return strategyDevices(hass, config).flatMap(
    (d2) => buildDeviceSections(hass, d2, config.distance_unit, config.calibration)
  );
}
function generateCards(hass, config) {
  return strategyDevices(hass, config).flatMap(
    (d2) => buildDeviceCards(hass, d2, config.distance_unit, config.calibration)
  );
}
function radarDeviceKey(hass, config) {
  return strategyDevices(hass, config).map(
    (d2) => {
      var _a2;
      return `${d2.deviceId}:${((_a2 = d2.profile) == null ? void 0 : _a2.key) ?? ""}:${d2.ld2450 ? 1 : 0}:${d2.online ? 1 : 0}`;
    }
  ).sort().join(",");
}
function shouldRegenerate(config, oldHass, newHass) {
  if (oldHass.devices === newHass.devices && oldHass.entities === newHass.entities) {
    if (!availabilityChanged(oldHass, newHass)) return false;
  }
  const cfg = config ?? {};
  return radarDeviceKey(oldHass, cfg) !== radarDeviceKey(newHass, cfg);
}
function isUnavailable(state) {
  return state === void 0 || state.state === "unavailable";
}
function availabilityChanged(oldHass, newHass) {
  for (const id in newHass.states) {
    const next = newHass.states[id];
    const prev = oldHass.states[id];
    if (prev === next) continue;
    if (isUnavailable(prev) !== isUnavailable(next)) return true;
  }
  return false;
}
const EMPTY_VIEW = {
  title: "Apollo Radar Tuning",
  cards: [
    {
      type: "markdown",
      content: "No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), R-PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant."
    }
  ]
};
const _ApolloLd2410ViewStrategy = class _ApolloLd2410ViewStrategy extends HTMLElement {
  static async generate(config, hass) {
    return { type: "sections", sections: generateSections(hass, config) };
  }
};
_ApolloLd2410ViewStrategy.shouldRegenerate = shouldRegenerate;
let ApolloLd2410ViewStrategy = _ApolloLd2410ViewStrategy;
const _ApolloLd2410DashboardStrategy = class _ApolloLd2410DashboardStrategy extends HTMLElement {
  static async generate(config, hass) {
    const views = generateViews(hass, config);
    return {
      title: "Apollo Radar Tuning",
      views: views.length ? views : [EMPTY_VIEW]
    };
  }
};
_ApolloLd2410DashboardStrategy.shouldRegenerate = shouldRegenerate;
let ApolloLd2410DashboardStrategy = _ApolloLd2410DashboardStrategy;
const _ApolloRadarSectionStrategy = class _ApolloRadarSectionStrategy extends HTMLElement {
  static async generate(config, hass) {
    return { type: "grid", cards: generateCards(hass, config) };
  }
};
_ApolloRadarSectionStrategy.shouldRegenerate = shouldRegenerate;
let ApolloRadarSectionStrategy = _ApolloRadarSectionStrategy;
registerElement("ll-strategy-view-apollo-radar-tuning", ApolloLd2410ViewStrategy);
registerElement(
  "ll-strategy-section-apollo-radar-tuning",
  ApolloRadarSectionStrategy
);
registerElement(
  "ll-strategy-dashboard-apollo-radar-tuning",
  ApolloLd2410DashboardStrategy
);
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some(
  (s2) => s2.type === "apollo-radar-tuning"
)) {
  window.customStrategies.push({
    type: "apollo-radar-tuning",
    strategyType: "dashboard",
    name: "Apollo Radar Tuning",
    description: "Auto-built tuning dashboard for Apollo radar devices (MSR / LD2410, R-PRO / LD2412).",
    documentationURL: "https://github.com/ApolloAutomation/apollo-mmwave-main"
  });
}
const CARD_VERSION = "2.2.0";
console.info(
  `%c APOLLO-MMWAVE %c v${CARD_VERSION} `,
  "color:#fff;background:#03a9f4;font-weight:700;",
  "color:#03a9f4;background:#fff;font-weight:700;"
);
export {
  CARD_VERSION
};
