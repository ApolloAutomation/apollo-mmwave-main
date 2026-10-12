/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var t,e=globalThis,n=e.ShadowRoot&&(void 0===e.ShadyCSS||e.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,i=Symbol(),r=/* @__PURE__ */new WeakMap,s=class{constructor(t,e,n){if(this._$cssResult$=!0,n!==i)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o;const e=this.t;if(n&&void 0===t){const n=void 0!==e&&1===e.length;n&&(t=r.get(e)),void 0===t&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),n&&r.set(e,t))}return t}toString(){return this.cssText}},o=(t,...e)=>{const n=1===t.length?t[0]:e.reduce((e,n,i)=>e+(t=>{if(!0===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+t[i+1],t[0]);return new s(n,t,i)},a=n?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const n of t.cssRules)e+=n.cssText;return(t=>new s("string"==typeof t?t:t+"",void 0,i))(e)})(t):t,{is:l,defineProperty:d,getOwnPropertyDescriptor:c,getOwnPropertyNames:u,getOwnPropertySymbols:h,getPrototypeOf:_}=Object,p=globalThis,v=p.trustedTypes,f=v?v.emptyScript:"",g=p.reactiveElementPolyfillSupport,m=(t,e)=>t,$={toAttribute(t,e){switch(e){case Boolean:t=t?f:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t)}return t},fromAttribute(t,e){let n=t;switch(e){case Boolean:n=null!==t;break;case Number:n=null===t?null:Number(t);break;case Object:case Array:try{n=JSON.parse(t)}catch(t){n=null}}return n}},y=(t,e)=>!l(t,e),b={attribute:!0,type:String,converter:$,reflect:!1,useDefault:!1,hasChanged:y};(t=Symbol).metadata??(t.metadata=Symbol("metadata")),p.litPropertyMetadata??(p.litPropertyMetadata=/* @__PURE__ */new WeakMap);var w=class extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??(this.l=[])).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=b){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){const n=Symbol(),i=this.getPropertyDescriptor(t,n,e);void 0!==i&&d(this.prototype,t,i)}}static getPropertyDescriptor(t,e,n){const{get:i,set:r}=c(this.prototype,t)??{get(){return this[e]},set(t){this[e]=t}};return{get:i,set(e){const s=null==i?void 0:i.call(this);null==r||r.call(this,e),this.requestUpdate(t,s,n)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??b}static _$Ei(){if(this.hasOwnProperty(m("elementProperties")))return;const t=_(this);t.finalize(),void 0!==t.l&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(m("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(m("properties"))){const t=this.properties,e=[...u(t),...h(t)];for(const n of e)this.createProperty(n,t[n])}const t=this[Symbol.metadata];if(null!==t){const e=litPropertyMetadata.get(t);if(void 0!==e)for(const[t,n]of e)this.elementProperties.set(t,n)}this._$Eh=/* @__PURE__ */new Map;for(const[e,n]of this.elementProperties){const t=this._$Eu(e,n);void 0!==t&&this._$Eh.set(t,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){const e=[];if(Array.isArray(t)){const n=new Set(t.flat(1/0).reverse());for(const t of n)e.unshift(a(t))}else void 0!==t&&e.push(a(t));return e}static _$Eu(t,e){const n=e.attribute;return!1===n?void 0:"string"==typeof n?n:"string"==typeof t?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var t;this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=/* @__PURE__ */new Map,this._$E_(),this.requestUpdate(),null===(t=this.constructor.l)||void 0===t||t.forEach(t=>t(this))}addController(t){var e;(this._$EO??(this._$EO=/* @__PURE__ */new Set)).add(t),void 0!==this.renderRoot&&this.isConnected&&(null===(e=t.hostConnected)||void 0===e||e.call(t))}removeController(t){var e;null===(e=this._$EO)||void 0===e||e.delete(t)}_$E_(){const t=/* @__PURE__ */new Map,e=this.constructor.elementProperties;for(const n of e.keys())this.hasOwnProperty(n)&&(t.set(n,this[n]),delete this[n]);t.size>0&&(this._$Ep=t)}createRenderRoot(){const t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((t,i)=>{if(n)t.adoptedStyleSheets=i.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const n of i){const i=document.createElement("style"),r=e.litNonce;void 0!==r&&i.setAttribute("nonce",r),i.textContent=n.cssText,t.appendChild(i)}})(t,this.constructor.elementStyles),t}connectedCallback(){var t;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),null===(t=this._$EO)||void 0===t||t.forEach(t=>{var e;return null===(e=t.hostConnected)||void 0===e?void 0:e.call(t)})}enableUpdating(t){}disconnectedCallback(){var t;null===(t=this._$EO)||void 0===t||t.forEach(t=>{var e;return null===(e=t.hostDisconnected)||void 0===e?void 0:e.call(t)})}attributeChangedCallback(t,e,n){this._$AK(t,n)}_$ET(t,e){const n=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,n);if(void 0!==i&&!0===n.reflect){var r;const s=(void 0!==(null===(r=n.converter)||void 0===r?void 0:r.toAttribute)?n.converter:$).toAttribute(e,n.type);this._$Em=t,null==s?this.removeAttribute(i):this.setAttribute(i,s),this._$Em=null}}_$AK(t,e){const n=this.constructor,i=n._$Eh.get(t);if(void 0!==i&&this._$Em!==i){var r,s;const t=n.getPropertyOptions(i),o="function"==typeof t.converter?{fromAttribute:t.converter}:void 0!==(null===(r=t.converter)||void 0===r?void 0:r.fromAttribute)?t.converter:$;this._$Em=i;const a=o.fromAttribute(e,t.type);this[i]=a??(null===(s=this._$Ej)||void 0===s?void 0:s.get(i))??a,this._$Em=null}}requestUpdate(t,e,n,i=!1,r){if(void 0!==t){var s;const o=this.constructor;if(!1===i&&(r=this[t]),n??(n=o.getPropertyOptions(t)),!((n.hasChanged??y)(r,e)||n.useDefault&&n.reflect&&r===(null===(s=this._$Ej)||void 0===s?void 0:s.get(t))&&!this.hasAttribute(o._$Eu(t,n))))return;this.C(t,e,n)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(t,e,{useDefault:n,reflect:i,wrapped:r},s){n&&!(this._$Ej??(this._$Ej=/* @__PURE__ */new Map)).has(t)&&(this._$Ej.set(t,s??e??this[t]),!0!==r||void 0!==s)||(this._$AL.has(t)||(this.hasUpdated||n||(e=void 0),this._$AL.set(t,e)),!0===i&&this._$Em!==t&&(this._$Eq??(this._$Eq=/* @__PURE__ */new Set)).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[t,e]of this._$Ep)this[t]=e;this._$Ep=void 0}const t=this.constructor.elementProperties;if(t.size>0)for(const[e,n]of t){const{wrapped:t}=n,i=this[e];!0!==t||this._$AL.has(e)||void 0===i||this.C(e,void 0,n,i)}}let t=!1;const e=this._$AL;try{var n;t=this.shouldUpdate(e),t?(this.willUpdate(e),null===(n=this._$EO)||void 0===n||n.forEach(t=>{var e;return null===(e=t.hostUpdate)||void 0===e?void 0:e.call(t)}),this.update(e)):this._$EM()}catch(e){throw t=!1,this._$EM(),e}t&&this._$AE(e)}willUpdate(t){}_$AE(t){var e;null===(e=this._$EO)||void 0===e||e.forEach(t=>{var e;return null===(e=t.hostUpdated)||void 0===e?void 0:e.call(t)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=/* @__PURE__ */new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&(this._$Eq=this._$Eq.forEach(t=>this._$ET(t,this[t]))),this._$EM()}updated(t){}firstUpdated(t){}};w.elementStyles=[],w.shadowRootOptions={mode:"open"},w[m("elementProperties")]=/* @__PURE__ */new Map,w[m("finalized")]=/* @__PURE__ */new Map,null==g||g({ReactiveElement:w}),(p.reactiveElementVersions??(p.reactiveElementVersions=[])).push("2.1.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var x=globalThis,S=t=>t,k=x.trustedTypes,A=k?k.createPolicy("lit-html",{createHTML:t=>t}):void 0,E="$lit$",R=`lit$${Math.random().toFixed(9).slice(2)}$`,M="?"+R,z=`<${M}>`,T=document,C=()=>T.createComment(""),L=t=>null===t||"object"!=typeof t&&"function"!=typeof t,O=Array.isArray,I="[ \t\n\f\r]",D=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,P=/-->/g,N=/>/g,U=RegExp(`>|${I}(?:([^\\s"'>=/]+)(${I}*=${I}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),F=/'/g,B=/"/g,H=/^(?:script|style|textarea|title)$/i,j=t=>(e,...n)=>({_$litType$:t,strings:e,values:n}),G=j(1),W=j(2),q=(j(3),Symbol.for("lit-noChange")),Z=Symbol.for("lit-nothing"),J=/* @__PURE__ */new WeakMap,V=T.createTreeWalker(T,129);function K(t,e){if(!O(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==A?A.createHTML(e):e}var X=(t,e)=>{const n=t.length-1,i=[];let r,s=2===e?"<svg>":3===e?"<math>":"",o=D;for(let a=0;a<n;a++){const e=t[a];let n,l,d=-1,c=0;for(;c<e.length&&(o.lastIndex=c,l=o.exec(e),null!==l);)c=o.lastIndex,o===D?"!--"===l[1]?o=P:void 0!==l[1]?o=N:void 0!==l[2]?(H.test(l[2])&&(r=RegExp("</"+l[2],"g")),o=U):void 0!==l[3]&&(o=U):o===U?">"===l[0]?(o=r??D,d=-1):void 0===l[1]?d=-2:(d=o.lastIndex-l[2].length,n=l[1],o=void 0===l[3]?U:'"'===l[3]?B:F):o===B||o===F?o=U:o===P||o===N?o=D:(o=U,r=void 0);const u=o===U&&t[a+1].startsWith("/>")?" ":"";s+=o===D?e+z:d>=0?(i.push(n),e.slice(0,d)+E+e.slice(d)+R+u):e+R+(-2===d?a:u)}return[K(t,s+(t[n]||"<?>")+(2===e?"</svg>":3===e?"</math>":"")),i]},Y=class t{constructor({strings:e,_$litType$:n},i){let r;this.parts=[];let s=0,o=0;const a=e.length-1,l=this.parts,[d,c]=X(e,n);if(this.el=t.createElement(d,i),V.currentNode=this.el.content,2===n||3===n){const t=this.el.content.firstChild;t.replaceWith(...t.childNodes)}for(;null!==(r=V.nextNode())&&l.length<a;){if(1===r.nodeType){if(r.hasAttributes())for(const t of r.getAttributeNames())if(t.endsWith(E)){const e=c[o++],n=r.getAttribute(t).split(R),i=/([.?@])?(.*)/.exec(e);l.push({type:1,index:s,name:i[2],strings:n,ctor:"."===i[1]?it:"?"===i[1]?rt:"@"===i[1]?st:nt}),r.removeAttribute(t)}else t.startsWith(R)&&(l.push({type:6,index:s}),r.removeAttribute(t));if(H.test(r.tagName)){const t=r.textContent.split(R),e=t.length-1;if(e>0){r.textContent=k?k.emptyScript:"";for(let n=0;n<e;n++)r.append(t[n],C()),V.nextNode(),l.push({type:2,index:++s});r.append(t[e],C())}}}else if(8===r.nodeType)if(r.data===M)l.push({type:2,index:s});else{let t=-1;for(;-1!==(t=r.data.indexOf(R,t+1));)l.push({type:7,index:s}),t+=R.length-1}s++}}static createElement(t,e){const n=T.createElement("template");return n.innerHTML=t,n}};function Q(t,e,n=t,i){var r,s;if(e===q)return e;let o=void 0!==i?null===(r=n._$Co)||void 0===r?void 0:r[i]:n._$Cl;const a=L(e)?void 0:e._$litDirective$;return(null==o?void 0:o.constructor)!==a&&(null==o||null===(s=o._$AO)||void 0===s||s.call(o,!1),void 0===a?o=void 0:(o=new a(t),o._$AT(t,n,i)),void 0!==i?(n._$Co??(n._$Co=[]))[i]=o:n._$Cl=o),void 0!==o&&(e=Q(t,o._$AS(t,e.values),o,i)),e}var tt=class{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:e},parts:n}=this._$AD,i=((null==t?void 0:t.creationScope)??T).importNode(e,!0);V.currentNode=i;let r=V.nextNode(),s=0,o=0,a=n[0];for(;void 0!==a;){if(s===a.index){let e;2===a.type?e=new et(r,r.nextSibling,this,t):1===a.type?e=new a.ctor(r,a.name,a.strings,this,t):6===a.type&&(e=new ot(r,this,t)),this._$AV.push(e),a=n[++o]}s!==(null==a?void 0:a.index)&&(r=V.nextNode(),s++)}return V.currentNode=T,i}p(t){let e=0;for(const n of this._$AV)void 0!==n&&(void 0!==n.strings?(n._$AI(t,n,e),e+=n.strings.length-2):n._$AI(t[e])),e++}},et=class t{get _$AU(){var t;return(null===(t=this._$AM)||void 0===t?void 0:t._$AU)??this._$Cv}constructor(t,e,n,i){this.type=2,this._$AH=Z,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=n,this.options=i,this._$Cv=(null==i?void 0:i.isConnected)??!0}get parentNode(){let t=this._$AA.parentNode;const e=this._$AM;return void 0!==e&&11===(null==t?void 0:t.nodeType)&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=Q(this,t,e),L(t)?t===Z||null==t||""===t?(this._$AH!==Z&&this._$AR(),this._$AH=Z):t!==this._$AH&&t!==q&&this._(t):void 0!==t._$litType$?this.$(t):void 0!==t.nodeType?this.T(t):(t=>O(t)||"function"==typeof(null==t?void 0:t[Symbol.iterator]))(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==Z&&L(this._$AH)?this._$AA.nextSibling.data=t:this.T(T.createTextNode(t)),this._$AH=t}$(t){var e;const{values:n,_$litType$:i}=t,r="number"==typeof i?this._$AC(t):(void 0===i.el&&(i.el=Y.createElement(K(i.h,i.h[0]),this.options)),i);if((null===(e=this._$AH)||void 0===e?void 0:e._$AD)===r)this._$AH.p(n);else{const t=new tt(r,this),e=t.u(this.options);t.p(n),this.T(e),this._$AH=t}}_$AC(t){let e=J.get(t.strings);return void 0===e&&J.set(t.strings,e=new Y(t)),e}k(e){O(this._$AH)||(this._$AH=[],this._$AR());const n=this._$AH;let i,r=0;for(const s of e)r===n.length?n.push(i=new t(this.O(C()),this.O(C()),this,this.options)):i=n[r],i._$AI(s),r++;r<n.length&&(this._$AR(i&&i._$AB.nextSibling,r),n.length=r)}_$AR(t=this._$AA.nextSibling,e){var n;for(null===(n=this._$AP)||void 0===n||n.call(this,!1,!0,e);t!==this._$AB;){const e=S(t).nextSibling;S(t).remove(),t=e}}setConnected(t){var e;void 0===this._$AM&&(this._$Cv=t,null===(e=this._$AP)||void 0===e||e.call(this,t))}},nt=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,n,i,r){this.type=1,this._$AH=Z,this._$AN=void 0,this.element=t,this.name=e,this._$AM=i,this.options=r,n.length>2||""!==n[0]||""!==n[1]?(this._$AH=Array(n.length-1).fill(/* @__PURE__ */new String),this.strings=n):this._$AH=Z}_$AI(t,e=this,n,i){const r=this.strings;let s=!1;if(void 0===r)t=Q(this,t,e,0),s=!L(t)||t!==this._$AH&&t!==q,s&&(this._$AH=t);else{const i=t;let o,a;for(t=r[0],o=0;o<r.length-1;o++)a=Q(this,i[n+o],e,o),a===q&&(a=this._$AH[o]),s||(s=!L(a)||a!==this._$AH[o]),a===Z?t=Z:t!==Z&&(t+=(a??"")+r[o+1]),this._$AH[o]=a}s&&!i&&this.j(t)}j(t){t===Z?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},it=class extends nt{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===Z?void 0:t}},rt=class extends nt{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==Z)}},st=class extends nt{constructor(t,e,n,i,r){super(t,e,n,i,r),this.type=5}_$AI(t,e=this){if((t=Q(this,t,e,0)??Z)===q)return;const n=this._$AH,i=t===Z&&n!==Z||t.capture!==n.capture||t.once!==n.once||t.passive!==n.passive,r=t!==Z&&(n===Z||i);i&&this.element.removeEventListener(this.name,this,n),r&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){var e;"function"==typeof this._$AH?this._$AH.call((null===(e=this.options)||void 0===e?void 0:e.host)??this.element,t):this._$AH.handleEvent(t)}},ot=class{constructor(t,e,n){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=n}get _$AU(){return this._$AM._$AU}_$AI(t){Q(this,t)}},at=x.litHtmlPolyfillSupport;null==at||at(Y,et),(x.litHtmlVersions??(x.litHtmlVersions=[])).push("3.3.3");var lt,dt=globalThis,ct=class extends w{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(t){const e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=((t,e,n)=>{const i=(null==n?void 0:n.renderBefore)??e;let r=i._$litPart$;if(void 0===r){const t=(null==n?void 0:n.renderBefore)??null;i._$litPart$=r=new et(e.insertBefore(C(),t),t,void 0,n??{})}return r._$AI(t),r})(e,this.renderRoot,this.renderOptions)}connectedCallback(){var t;super.connectedCallback(),null===(t=this._$Do)||void 0===t||t.setConnected(!0)}disconnectedCallback(){var t;super.disconnectedCallback(),null===(t=this._$Do)||void 0===t||t.setConnected(!1)}render(){return q}};ct._$litElement$=!0,ct.finalized=!0,null===(lt=dt.litElementHydrateSupport)||void 0===lt||lt.call(dt,{LitElement:ct});var ut=dt.litElementPolyfillSupport;null==ut||ut({LitElement:ct}),(dt.litElementVersions??(dt.litElementVersions=[])).push("4.2.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var ht={attribute:!0,type:String,converter:$,reflect:!1,hasChanged:y},_t=(t=ht,e,n)=>{const{kind:i,metadata:r}=n;let s=globalThis.litPropertyMetadata.get(r);if(void 0===s&&globalThis.litPropertyMetadata.set(r,s=/* @__PURE__ */new Map),"setter"===i&&((t=Object.create(t)).wrapped=!0),s.set(n.name,t),"accessor"===i){const{name:i}=n;return{set(n){const r=e.get.call(this);e.set.call(this,n),this.requestUpdate(i,r,t,!0,n)},init(e){return void 0!==e&&this.C(i,void 0,t,e),e}}}if("setter"===i){const{name:i}=n;return function(n){const r=this[i];e.call(this,n),this.requestUpdate(i,r,t,!0,n)}}throw Error("Unsupported decorator location: "+i)};function pt(t){return(e,n)=>"object"==typeof n?_t(t,e,n):((t,e,n)=>{const i=e.hasOwnProperty(n);return e.constructor.createProperty(n,t),i?Object.getOwnPropertyDescriptor(e,n):void 0})(t,e,n)}
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/function vt(t){return pt({...t,state:!0,attribute:!1})}var ft=[],gt=/* @__PURE__ */new WeakMap;function mt(t,e){return function(t){let e=gt.get(t);if(!e){e=/* @__PURE__ */new Map;for(const[n,i]of Object.entries(t)){const t=e.get(i.device_id);t?t.push([n,i]):e.set(i.device_id,[[n,i]])}gt.set(t,e)}return e}(t).get(e)??ft}function $t(t){return`${t}: the configured detection-range limit, shown as a gate number.`}var yt="💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values. Or press **Calibrate with empty room** on the Auto-calibrate card to set them from your empty room.",bt="**Radar Timeout** is how long presence stays on after the last detection; raise it if lights flick off while you sit still.",wt={move:[50,50,40,30,20,15,15,15,15],still:[0,0,40,40,30,30,20,20,20]},xt={key:"ld2410",label:"LD2410",maxBarLabels:["Max Move","Max Still"],rangeLabels:["Max Move Gate","Max Still Gate"],gateSizeLabel:"Gate Size",rangeTip:"💡 **Gate Size** sets how far each gate reaches (e.g. 0.75 m). **Max Move / Still Gate** cap the farthest gate used to detect moving vs. still targets; lower them to ignore distant motion. "+bt,gateTip:yt,wikiUrl:"https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/",entityMap(t){const e=[0,1,2,3,4,5,6,7,8],n=t=>e.map(e=>t(e));return{engineering_mode:`switch.${t}_radar_engineering_mode`,bluetooth:`switch.${t}_ld2410_bluetooth`,restart_radar:`button.${t}_restart_radar`,factory_reset_radar:`button.${t}_factory_reset_radar`,esp_reboot:`button.${t}_esp_reboot`,query_params:`button.${t}_query_params`,radar_timeout:`number.${t}_radar_timeout`,zone_1_start:`number.${t}_radar_zone_1_start`,end_zone_1:`number.${t}_radar_end_zone_1`,end_zone_2:`number.${t}_radar_end_zone_2`,end_zone_3:`number.${t}_radar_end_zone_3`,max_move_distance:`number.${t}_radar_max_move_distance`,max_still_distance:`number.${t}_radar_max_still_distance`,gate_size:`select.${t}_ld2410_gate_size`,move_threshold:n(e=>`number.${t}_g${e}_move_threshold`),still_threshold:n(e=>`number.${t}_g${e}_still_threshold`),move_energy:n(e=>`sensor.${t}_g${e}_move_energy`),still_energy:n(e=>`sensor.${t}_g${e}_still_energy`),still_distance:`sensor.${t}_radar_still_distance`,moving_distance:`sensor.${t}_radar_moving_distance`,detection_distance:`sensor.${t}_radar_detection_distance`,radar_target:`binary_sensor.${t}_radar_target`,moving_target:`binary_sensor.${t}_radar_moving_target`,still_target:`binary_sensor.${t}_radar_still_target`,zone_1_occupancy:`binary_sensor.${t}_radar_zone_1_occupancy`,zone_2_occupancy:`binary_sensor.${t}_radar_zone_2_occupancy`,zone_3_occupancy:`binary_sensor.${t}_radar_zone_3_occupancy`}}},St={key:"ld2412",label:"LD2412",maxBarLabels:["Max Gate","Min Gate"],maxBarTips:[$t("Max Gate"),"Min Gate: gates below this one are ignored for detection."],rangeLabels:["Max Gate","Min Gate"],gateSizeLabel:"Distance Resolution",rangeTip:"💡 **Distance Resolution** sets gate spacing: smaller (0.5 m) gives finer tuning over a shorter range, larger (0.75 m) reaches farther. **Min / Max Gate** limit which gates are used for detection. "+bt,gateTip:yt,wikiUrl:"https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/#r-pro-1-and-its-ld2412-radar",entityMap(t){const e=Array.from({length:14},(t,e)=>e),n=t=>e.map(e=>t((t=>String(t).padStart(2,"0"))(e)));return{engineering_mode:`switch.${t}_ld2412_engineering_mode`,bluetooth:`switch.${t}_ld2412_bluetooth`,restart_radar:`button.${t}_ld2412_restart`,factory_reset_radar:`button.${t}_ld2412_factory_reset`,esp_reboot:`button.${t}_esp_reboot`,radar_timeout:`number.${t}_ld2412_timeout`,zone_1_start:void 0,end_zone_1:void 0,end_zone_2:void 0,end_zone_3:void 0,zone_1_occupancy:void 0,zone_2_occupancy:void 0,zone_3_occupancy:void 0,max_move_distance:`number.${t}_ld2412_max_distance_gate`,max_still_distance:`number.${t}_ld2412_min_distance_gate`,gate_size:`select.${t}_ld2412_distance_resolution`,move_threshold:n(e=>`number.${t}_ld2412_g${e}_move_threshold`),still_threshold:n(e=>`number.${t}_ld2412_g${e}_still_threshold`),move_energy:n(e=>`sensor.${t}_ld2412_g${e}_move_energy`),still_energy:n(e=>`sensor.${t}_ld2412_g${e}_still_energy`),still_distance:void 0,moving_distance:void 0,detection_distance:void 0,radar_target:`binary_sensor.${t}_ld2412_presence`,moving_target:`binary_sensor.${t}_ld2412_moving_target`,still_target:`binary_sensor.${t}_ld2412_still_target`,background_correction:`button.${t}_ld2412_start_dynamic_background_correction`,background_correction_status:`binary_sensor.${t}_ld2412_dynamic_background_correction_status`,query_params:`button.${t}_ld2412_query_params`}}},kt=[St,xt],At=[{prefix:"msr-1",profile:xt,ld2450:!1},{prefix:"msr-2",profile:xt,ld2450:!1},{prefix:"mtr-1",ld2450:!0},{prefix:"r-pro-1",profile:St,ld2450:!0}];function Et(t){if(!(null==t?void 0:t.manufacturer)||!t.model)return;if("apolloautomation"!==t.manufacturer.toLowerCase())return;const e=t.model.toLowerCase(),n=At.find(t=>e.startsWith(t.prefix));return n?{profile:n.profile,ld2450:n.ld2450}:void 0}function Rt(t,e){for(const n of kt){const i=n.entityMap(e).engineering_mode;if(i&&i in t.states)return n}}var Mt=[/_ld2412_(?!.*ld2412_).+$/,/_ld2450_(?!.*ld2450_).+$/,/_target_\d+_[xy](?:_\d+)?$/,/_radar_engineering_mode(?:_\d+)?$/,/_ld2410_bluetooth(?:_\d+)?$/,/_radar_control_bluetooth(?:_\d+)?$/,/_radar_distance_resolution(?:_\d+)?$/,/_restart_radar(?:_\d+)?$/,/_factory_reset_radar(?:_\d+)?$/,/_esp_reboot(?:_\d+)?$/,/_radar_timeout(?:_\d+)?$/,/_radar_zone_\d+_start(?:_\d+)?$/,/_radar_end_zone_\d+(?:_\d+)?$/,/_radar_max_move_distance(?:_\d+)?$/,/_radar_max_still_distance(?:_\d+)?$/,/_ld2410_gate_size(?:_\d+)?$/,/_g\d+_move_threshold(?:_\d+)?$/,/_g\d+_still_threshold(?:_\d+)?$/,/_g\d+_move_energy(?:_\d+)?$/,/_g\d+_still_energy(?:_\d+)?$/,/_radar_still_distance(?:_\d+)?$/,/_radar_moving_distance(?:_\d+)?$/,/_radar_detection_distance(?:_\d+)?$/,/_radar_moving_target(?:_\d+)?$/,/_radar_still_target(?:_\d+)?$/,/_radar_target(?:_\d+)?$/,/_radar_zone_\d+_occupancy(?:_\d+)?$/];function zt(t){for(const e of Mt)if(e.test(t))return t.replace(e,"")}function Tt(t,e){const n=mt(t.entities,e).map(([t])=>t.slice(t.indexOf(".")+1)),i=/* @__PURE__ */new Map;for(const o of n){const t=zt(o);t&&i.set(t,(i.get(t)??0)+1)}let r,s=0;for(const[o,a]of i)a>s&&(r=o,s=a);return r}var Ct=["move_threshold","still_threshold","move_energy","still_energy"],Lt="(?:_\\d+)?$",Ot=(t,e,n)=>({slot:t,domain:e,re:new RegExp(n+Lt)}),It=[Ot("engineering_mode","switch","_radar_engineering_mode"),Ot("bluetooth","switch","_ld2410_bluetooth"),Ot("bluetooth","switch","_radar_control_bluetooth"),Ot("gate_size","select","_radar_distance_resolution"),Ot("restart_radar","button","_restart_radar"),Ot("factory_reset_radar","button","_factory_reset_radar"),Ot("esp_reboot","button","_esp_reboot"),Ot("query_params","button","_query_params"),Ot("radar_timeout","number","_radar_timeout"),Ot("zone_1_start","number","_radar_zone_1_start"),Ot("end_zone_1","number","_radar_end_zone_1"),Ot("end_zone_2","number","_radar_end_zone_2"),Ot("end_zone_3","number","_radar_end_zone_3"),Ot("max_move_distance","number","_radar_max_move_distance"),Ot("max_still_distance","number","_radar_max_still_distance"),Ot("gate_size","select","_ld2410_gate_size"),Ot("still_distance","sensor","_radar_still_distance"),Ot("moving_distance","sensor","_radar_moving_distance"),Ot("detection_distance","sensor","_radar_detection_distance"),Ot("moving_target","binary_sensor","_radar_moving_target"),Ot("still_target","binary_sensor","_radar_still_target"),Ot("radar_target","binary_sensor","_radar_target"),Ot("zone_1_occupancy","binary_sensor","_radar_zone_1_occupancy"),Ot("zone_2_occupancy","binary_sensor","_radar_zone_2_occupancy"),Ot("zone_3_occupancy","binary_sensor","_radar_zone_3_occupancy"),Ot("engineering_mode","switch","_ld2412_engineering_mode"),Ot("bluetooth","switch","_ld2412_bluetooth"),Ot("restart_radar","button","_ld2412_restart"),Ot("factory_reset_radar","button","_ld2412_factory_reset"),Ot("radar_timeout","number","_ld2412_timeout"),Ot("max_move_distance","number","_ld2412_max_distance_gate"),Ot("max_still_distance","number","_ld2412_min_distance_gate"),Ot("gate_size","select","_ld2412_distance_resolution"),Ot("radar_target","binary_sensor","_ld2412_presence"),Ot("moving_target","binary_sensor","_ld2412_moving_target"),Ot("still_target","binary_sensor","_ld2412_still_target"),Ot("background_correction","button","_ld2412_start_dynamic_background_correction"),Ot("background_correction_status","binary_sensor","_ld2412_dynamic_background_correction_status"),Ot("query_params","button","_ld2412_query_params")],Dt=[["move_threshold","number"],["still_threshold","number"],["move_energy","sensor"],["still_energy","sensor"]].map(([t,e])=>({slot:t,domain:e,re:new RegExp(`_g(\\d+)_${t}${Lt}`)}));function Pt(t,e){for(const n of Dt){const i=n.re.exec(e);if(i)return t===n.domain?{slot:n.slot,gate:parseInt(i[1],10)}:void 0}for(const n of It)if(n.re.test(e))return t===n.domain?{slot:n.slot}:void 0}var Nt=[/_ld2410_/,new RegExp(`_radar_engineering_mode${Lt}`),new RegExp(`_g\\d+_(?:move|still)_(?:threshold|energy)${Lt}`),new RegExp(`_radar_max_(?:move|still)_distance${Lt}`)];function Ut(t,e){let n=!1;for(const[i]of mt(t.entities,e)){const t=i.slice(i.indexOf(".")+1);if(/_ld2412_/.test(t))return St;n||(n=Nt.some(e=>e.test(t)))}return n?xt:void 0}function Ft(t,e){const n={move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]};let i=!1;for(const[r]of mt(t.entities,e)){const t=r.indexOf("."),e=Pt(r.slice(0,t),r.slice(t+1));if(e)if("gate"in e){const t=n[e.slot];void 0===t[e.gate]&&(t[e.gate]=r,i=!0)}else void 0===n[e.slot]&&(n[e.slot]=r,i=!0)}return i?n:void 0}function Bt(t,e){let n;return e.device_id&&(n=Tt(t,e.device_id)),!n&&e.device_base_name&&(n=e.device_base_name),n}function Ht(t,e){if(e.device_id){const n=Ut(t,e.device_id);if(n)return n;const i=Et(t.devices[e.device_id]);if(i)return i.profile}const n=Bt(t,e);if(n)return Rt(t,n)??xt}function jt(t,e){let n,i;if(e.device_id&&(n=Ft(t,e.device_id)),!n){i=Bt(t,e);const r=i?Ht(t,e)??xt:void 0;n=i&&r?r.entityMap(i):{move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]}}const r=e.entities?function(t,e){const n={...t,...e};for(const i of Ct)Array.isArray(n[i])||(n[i]=t[i]);return n}(n,e.entities):n;return i?{map:r,fallbackBase:i}:{map:r}}function Gt(t,e){if("string"==typeof e)t.push(e);else if(Array.isArray(e))for(const n of e)n&&t.push(n)}function Wt(t){const e=[];for(const n of Object.values(t))Gt(e,n);return e}function qt(t,e){const n=[];for(const i of e)Gt(n,t[i]);return n}function Zt(t,e,n){return(null==t?void 0:t.resolved)===e?t:{resolved:e,ids:qt(e.map,n)}}function Jt(t){return Wt(t).filter(e=>e!==t.esp_reboot)}function Vt(t,e,n){if(t&&t.config===n&&t.entities===e.entities&&t.devices===e.devices&&(void 0===t.fallbackBase||Rt(e,t.fallbackBase)===t.fallbackDetected))return t;const{map:i,fallbackBase:r}=jt(e,n);return{config:n,entities:e.entities,devices:e.devices,map:i,profile:Ht(e,n),ids:Wt(i),radarIds:Jt(i),fallbackBase:r,fallbackDetected:void 0===r?void 0:Rt(e,r)}}function Kt(t,e,n){return n.some(n=>t.states[n]!==e.states[n])}function Xt(t,e,n,i,r){if(i!==n)return Kt(t,e,i.ids);const{radarIds:s}=i;return Yt(t,s)!==Yt(e,s)||Kt(t,e,r)}function Yt(t,e){return e.some(e=>e in t.states)}var Qt=/* @__PURE__ */new Map,te=!1;function ee(t,e){try{window.customElements.get(t)||window.customElements.define(t,e)}catch{}}function ne(){for(const[t,e]of Qt)ee(t,e)}function ie(t,e){if(Qt.set(t,e),ee(t,e),!te){te=!0;for(const t of["home-assistant","hc-main"])window.customElements.whenDefined(t).then(ne,()=>{})}}function re(t,e,n){const i=window.customCards=window.customCards||[];i.some(e=>e.type===t)||i.push({type:t,name:e,description:n,documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"})}var se=["mm","cm","m","in","ft","yd"],oe={mm:.001,cm:.01,m:1,in:.0254,ft:.3048,yd:.9144};function ae(t){return!!t&&se.includes(t)}function le(t,e,n){return e===n?t:function(t,e){return t*oe[e]}(t,e)/oe[n]}function de(t,e){if(!e)return;const n=t.states[e];if(!n)return;const i=parseFloat(n.state);return Number.isFinite(i)?i:void 0}function ce(t,e,n){return e<=0?0:function(t,e,n){return Math.max(e,Math.min(n,t))}(t/e*n,0,n)}function ue(t){return Math.max(t.move_threshold.length,t.still_threshold.length,t.move_energy.length,t.still_energy.length)}var he="#2e7d32",_e="#6a1b9a",pe=["#d32f2f","#1565c0","#2e7d32"];function ve(t,e){return`hsl(${220-220*t/Math.max(1,e-1)}, 64%, 48%)`}var fe="var(--secondary-text-color, #9aa0a6)";function ge(t,e,n){const i=de(t,e);if(void 0!==i)return le(i,function(t,e,n){var i;const r=e?null===(i=t.states[e])||void 0===i||null===(i=i.attributes)||void 0===i?void 0:i.unit_of_measurement:void 0;return ae(r)?r:n}(t,e,n),n)}var me=["gate_size","detection_distance","moving_distance","still_distance","radar_target","moving_target","still_target","zone_1_start","end_zone_1","end_zone_2","end_zone_3","zone_1_occupancy","zone_2_occupancy","zone_3_occupancy","max_move_distance","max_still_distance"];function $e(t,e,n){var i;const r=le(function(t){if(!t)return;const e=t.replace(",",".").match(/[0-9]*\.?[0-9]+/);if(!e)return;const n=parseFloat(e[0]);return Number.isFinite(n)?n:void 0}(e.gate_size?null===(i=t.states[e.gate_size])||void 0===i?void 0:i.state:void 0)??.75,"m",n),s=ue(e),o=s>1?s-1:8,a=r*o,l=[],d=(e,i,r,s)=>{var o;if(!e||!(e in t.states))return;const a=!!i&&"off"===(null===(o=t.states[i])||void 0===o?void 0:o.state);l.push({label:r,value:a?0:ge(t,e,n)??0,color:s,noTarget:a})};d(e.detection_distance,e.radar_target,"Detection","#b71c1c"),d(e.moving_distance,e.moving_target,"Moving",_e),d(e.still_distance,e.still_target,"Still",he);const c=[],u=[ge(t,e.zone_1_start,n),ge(t,e.end_zone_1,n),ge(t,e.end_zone_2,n),ge(t,e.end_zone_3,n)],h=[e.zone_1_occupancy,e.zone_2_occupancy,e.zone_3_occupancy];for(let f=0;f<3;f++){var _;const e=u[f],n=u[f+1];if(void 0===e||void 0===n)continue;const i=h[f];c.push({label:`Zone ${f+1}`,start:e,end:n,color:pe[f],occupied:!!i&&"on"===(null===(_=t.states[i])||void 0===_?void 0:_.state)})}const p=de(t,e.max_still_distance),v=de(t,e.max_move_distance);return{unit:n,gateSizeChart:r,gateCount:o,maxRange:a,bars:l,zones:c,maxStill:void 0===p?void 0:p*r,maxMove:void 0===v?void 0:v*r,maxStillGate:p,maxMoveGate:v}}var ye=64,be=22,we=15;function xe(t,e,n,i=xt.maxBarLabels,r="LD2410",s){if(0===e.move_threshold.length)return Z;const o=$e(t,e,n),a=t=>ye+ce(t,o.maxRange,402),l=[];o.zones.length&&l.push({kind:"zones"});for(const p of o.bars)l.push({kind:"bar",bar:p});l.push({kind:"gates"}),void 0!==o.maxMove&&void 0!==o.maxMoveGate&&l.push({kind:"max",label:i[0],value:o.maxMove,gate:o.maxMoveGate,tip:null==s?void 0:s[0],color:_e}),void 0!==o.maxStill&&void 0!==o.maxStillGate&&l.push({kind:"max",label:i[1],value:o.maxStill,gate:o.maxStillGate,tip:null==s?void 0:s[1],color:he});const d=6+30*l.length,c=d+52,u=t=>o.gateSizeChart>=10?t.toFixed(0):String(Number(t.toFixed(2))),h=[];for(let p=0;p<=o.gateCount;p++){const t=a(o.gateSizeChart*p),e=o.gateSizeChart*p;h.push(W`
      <line x1=${t} y1=${6} x2=${t} y2=${d}
        stroke="var(--divider-color, #555)" stroke-width="1" opacity="0.3"></line>
      <text x=${t} y=${d+13} font-size="11" text-anchor="end"
        transform="rotate(-45 ${t} ${d+13})" fill=${fe}>${u(e)} ${n}</text>`)}const _=l.map((t,e)=>{const i=6+30*e,r=W`<text x=${58} y=${i+we} font-size="12"
      text-anchor="end" fill=${fe}>${function(t){return"zones"===t.kind?"Zones":"gates"===t.kind?"Gates":"bar"===t.kind?t.bar.label:t.label}(t)}</text>`;let s;if("zones"===t.kind)s=o.zones.map((t,e)=>{const n=a(t.start),r=a(t.end),s=r-n,o=s>=40;return W`
          <rect x=${n} y=${i} width=${Math.max(1,s)} height=${be}
            rx="4" fill=${t.color} opacity=${t.occupied?.95:.6}></rect>
          ${o?W`<text x=${n+6} y=${i+we} font-size="13" font-weight="600"
                fill="#fff">Z${e+1}</text>`:Z}
          <circle cx=${r-11} cy=${i+11} r="5"
            fill=${t.occupied?"#fff":"none"} stroke="#fff" stroke-width="2"></circle>`});else if("bar"===t.kind){const e=a(t.bar.value),r=t.bar.noTarget?"no target":(t=>`${t.toFixed(1)} ${n}`)(t.bar.value);s=W`
        <rect x=${ye} y=${i} width=${Math.max(1,e-ye)} height=${be}
          rx="4" fill=${t.bar.color}></rect>
        ${function(t,e,n){return t>296.36?W`<text x=${t-6} y=${n+we} font-size="13" text-anchor="end" fill="#fff">${e}</text>`:W`<text x=${t+6} y=${n+we} font-size="13" fill=${"var(--primary-text-color, #e6e6e6)"}>${e}</text>`}(e,r,i)}`}else if("gates"===t.kind){const t=[];for(let e=0;e<o.gateCount;e++){const n=a(o.gateSizeChart*e),r=a(o.gateSizeChart*(e+1));t.push(W`
          <rect x=${n} y=${i} width=${Math.max(1,r-n)} height=${be}
            fill=${ve(e,o.gateCount)}></rect>
          <text x=${(n+r)/2} y=${i+we} font-size="12" font-weight="600"
            text-anchor="middle" fill="#fff">G${e+1}</text>`)}s=t}else{const e=a(t.value),n=`G${t.gate}`;s=W`
        <rect x=${ye} y=${i} width=${Math.max(1,e-ye)} height=${be}
          rx="4" fill=${t.color} opacity="0.6"></rect>
        <text x=${(ye+e)/2} y=${i+we} font-size="13" font-weight="600"
          text-anchor="middle" fill="#fff">${n}</text>`}const l="bar"===t.kind&&t.bar.noTarget?W`<g opacity=${.45}>${r}${s}</g>`:W`${r}${s}`;return W`<g>
      <title>${function(t){if("zones"===t.kind)return"Detection zones. The circle shows whether a target is currently in each zone (filled = present).";if("gates"===t.kind)return"The radar splits its range into gates. Each colored segment is one distance bin (G1, G2, ...).";if("max"===t.kind)return t.tip??$t(t.label);const e="Detection"===(n=t.bar.label)?"Current distance to the detected target.":"Moving"===n?"Current distance to a moving target.":"Current distance to a still (stationary) target.";var n;return t.bar.noTarget?`${e} The radar reports no target right now.`:e}(t)}</title>
      <rect x="0" y=${i} width=${478} height=${be} fill="transparent"></rect>
      ${l}
    </g>`});return G`
    <svg viewBox="0 0 ${478} ${c}" width="100%" role="img"
      aria-label="${r} distances">
      ${h} ${_}
    </svg>
  `}function Se(t,e,n,i){var r,s=arguments.length,o=s<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,n):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)o=Reflect.decorate(t,e,n,i);else for(var a=t.length-1;a>=0;a--)(r=t[a])&&(o=(s<3?r(o):s>3?r(e,n,o):r(e,n))||o);return s>3&&o&&Object.defineProperty(e,n,o),o}var ke=class extends ct{setConfig(t){this._config=t}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-distance-card"}}shouldUpdate(t){if(!t.has("hass")||t.has("_config"))return!0;const e=t.get("hass");if(!e||!this.hass||!this._config)return!0;if(e.entities!==this.hass.entities||e.devices!==this.hass.devices||e.config!==this.hass.config)return!0;const n=this._resolved;return this._resolved=Vt(n,this.hass,this._config),this._watched=Zt(this._watched,this._resolved,me),Xt(e,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return Z;this._resolved=Vt(this._resolved,this.hass,this._config);const{map:t,profile:e,radarIds:n}=this._resolved;if(!Yt(this.hass,n))return this._renderNotFound();const i=ae(this._config.distance_unit)?this._config.distance_unit:"mi"===(null==(r=this.hass)||null===(s=r.config)||void 0===s||null===(s=s.unit_system)||void 0===s?void 0:s.length)?"in":"m";var r,s;const o=(null==e?void 0:e.label)??"LD2410",a=xe(this.hass,t,i,null==e?void 0:e.maxBarLabels,o,null==e?void 0:e.maxBarTips);return a===Z?Z:G`
      <ha-card .header=${this._config.title??`${o} Distances`}>
        <div class="wrap">${a}</div>
      </ha-card>
    `}_renderNotFound(){var t,e;const n=(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.label)??"LD2410";return G`
      <ha-card .header=${(null===(e=this._config)||void 0===e?void 0:e.title)??`${n} Distances`}>
        <div class="not-found">
          Apollo mmWave: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};ke.styles=o`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
  `,Se([pt({attribute:!1})],ke.prototype,"hass",void 0),Se([vt()],ke.prototype,"_config",void 0),ie("apollo-radar-distance-card",ke),re("apollo-radar-distance-card","Apollo Radar Distance Chart","Distance / zone chart for Apollo MSR (LD2410) & R PRO (LD2412).");var Ae="apollo_mmwave",Ee=`${Ae}/calibration/subscribe`,Re=[1e3,2e3,5e3,1e4,2e4],Me="Apollo mmWave is not loaded, so calibration is unavailable.",ze=/^Validation error:\s*/;function Te(t,e,n,i,r=!1){return t.callService(e,n,i,void 0,r)}function Ce(t){const e={};for(const[n,i]of Object.entries(t))void 0!==i&&(e[n]=i);return e}function Le(t){if(t&&"object"==typeof t&&void 0===t.code){const e=t.error;if(e&&"object"==typeof e)return e}return t}function Oe(t){const e=Le(t);if("apollo_mmwave"===(null==e?void 0:e.translation_domain))return"string"==typeof e.translation_key?e.translation_key:void 0}function Ie(t){const e=t.trim();return/[.!?]$/.test(e)?e:`${e}.`}function De(t,e={}){const n=Le(t),i=null==n?void 0:n.code;if("not_found"===i){var r;if("service"!==e.source)return"Home Assistant has no device with this id. The radar was probably removed and re-added; reload the dashboard, or set device_id in the card YAML.";const t=null==n||null===(r=n.translation_placeholders)||void 0===r?void 0:r.domain;if(void 0===t||"apollo_mmwave"===t)return Me}if("not_loaded"===i)return Me;const s=function(t,e){const n=null==t?void 0:t.translation_domain,i=null==t?void 0:t.translation_key;if(!e||!n||!i)return null;let r;try{r=e(`component.${n}.exceptions.${i}.message`,t.translation_placeholders??void 0)}catch{return null}return!r||r.startsWith("Translation error")?null:Ie(r)}(n,e.localize);if(s)return s;const o="string"==typeof n?n:null==n?void 0:n.message;if(o){const t=String(o).replace(ze,"");if(t.trim())return Ie(t)}return"Home Assistant rejected the request."}async function Pe(t,e){var n;const i=null===(n=Le(e))||void 0===n?void 0:n.translation_domain;if(i&&"function"==typeof t.loadBackendTranslation)try{const e=await t.loadBackendTranslation("exceptions",i);if("function"==typeof e)return e}catch{}return"function"==typeof t.localize?t.localize.bind(t):void 0}async function Ne(t,e){return De(e,{source:"service",localize:await Pe(t,e)})}var Ue="#4b0082",Fe="#9467bd",Be="#274e13",He="#8cb640",je="var(--secondary-text-color, #9aa0a6)",Ge=o`
  .chart-legend {
    font-size: 0.8em;
    color: var(--secondary-text-color);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 6px;
  }
`,We=["engineering_mode","move_threshold","still_threshold","move_energy","still_energy"];function qe(t){return 10+186*(1-Math.max(0,Math.min(100,t))/100)}function Ze(t,e,n="LD2410"){var i;const r=function(t,e){var n,i;let r=!1;const s=e=>{e&&e in t.states&&(r=!0)},o=ue(e),a=Array.from({length:o},(n,i)=>(s(e.move_energy[i]),s(e.still_energy[i]),s(e.move_threshold[i]),s(e.still_threshold[i]),{index:i,move:de(t,e.move_energy[i])??0,still:de(t,e.still_energy[i])??0,moveThr:de(t,e.move_threshold[i]),stillThr:de(t,e.still_threshold[i])}));return{engineeringMode:!!e.engineering_mode&&"on"===(null===(n=t.states[e.engineering_mode])||void 0===n?void 0:n.state),unavailable:!!e.engineering_mode&&"unavailable"===(null===(i=t.states[e.engineering_mode])||void 0===i?void 0:i.state),present:r,gates:a}}(t,e);if(!r.present)return Z;const s=444/r.gates.length,o=.32*s,a=qe(0),l=r.gates.map(t=>{const e=26+s*t.index+s/2,n=e-o-2,i=e+2,l=[],d=r.engineeringMode&&void 0!==t.moveThr&&t.move>t.moveThr,c=r.engineeringMode&&void 0!==t.stillThr&&t.still>t.stillThr;if(l.push(W`
      <rect x=${n} y=${qe(t.move)} width=${o} height=${a-qe(t.move)}
        fill=${Ue}
        stroke="${d?Fe:Z}"
        stroke-width="${d?"2":Z}"></rect>
      <rect x=${i} y=${qe(t.still)} width=${o} height=${a-qe(t.still)}
        fill=${Be}
        stroke="${c?He:Z}"
        stroke-width="${c?"2":Z}"></rect>
      <text x=${e} y=${213} font-size="13" text-anchor="middle"
        fill=${je}>G${t.index}</text>`),r.engineeringMode&&void 0!==t.moveThr){const e=qe(t.moveThr),i=n+o/2;l.push(W`<path d="M ${i-5} ${e-5} L ${i-5} ${e+5} L ${i+5} ${e} Z"
        fill=${Fe}></path>`)}if(r.engineeringMode&&void 0!==t.stillThr){const e=qe(t.stillThr),n=i+o/2;l.push(W`<path d="M ${n+5} ${e-5} L ${n+5} ${e+5} L ${n-5} ${e} Z"
        fill=${He}></path>`)}return l}),d=[0,25,50,75,100].map(t=>W`
      <line x1=${26} y1=${qe(t)} x2=${470} y2=${qe(t)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${22} y=${qe(t)+3} font-size="11" text-anchor="end"
        fill=${je}>${t}</text>`),[c,u]=r.unavailable?["Radar unavailable","Waiting for the device to reconnect"]:["Turn on Radar Engineering Mode","to see gate energy values"],h=r.engineeringMode?Z:W`
        <rect x=${26} y=${10} width=${444} height=${186}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${248} y=${103} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${248} dy="-4">${c}</tspan>
          <tspan x=${248} dy="28">${u}</tspan>
        </text>`,_=e.engineering_mode,p=_?null===(i=t.states[_])||void 0===i?void 0:i.state:void 0,v=!r.engineeringMode&&!!_&&!!t.callService&&void 0!==p&&"unavailable"!==p?G`<button
        type="button"
        class="overlay"
        tabindex="0"
        style="position:absolute;left:${248/470*100}%;top:${72.18181818181819}%;transform:translate(-50%,-50%)"
        @click=${()=>Te(t,"switch","turn_on",{entity_id:_},!0).catch(()=>{})}
      >
        Turn on Radar Engineering Mode
      </button>`:Z,f=G`
    <svg viewBox="0 0 ${470} ${220}" width="100%" role="img"
      aria-label="${n} gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A gate
        detects a target when its energy rises above the threshold. Turn on
        Radar Engineering Mode to see live energy.
      </title>
      ${d} ${l} ${h}
    </svg>
  `;return G`
    <div class="chart-plot" style="position:relative">
      ${f} ${v}
    </div>
    <div class="chart-legend">
      <span><span style="color:${Ue}">■</span> Move energy</span>
      <span><span style="color:${Be}">■</span> Still energy</span>
      <span><span style="color:${Fe}">▶</span> Move threshold</span>
      <span><span style="color:${He}">◀</span> Still threshold</span>
      <span>outlined bar = above threshold (detecting)</span>
    </div>
  `}var Je=class extends ct{setConfig(t){this._config=t}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-gate-energy-card"}}shouldUpdate(t){if(!t.has("hass")||t.has("_config"))return!0;const e=t.get("hass");if(!e||!this.hass||!this._config)return!0;if(e.entities!==this.hass.entities||e.devices!==this.hass.devices)return!0;const n=this._resolved;return this._resolved=Vt(n,this.hass,this._config),this._watched=Zt(this._watched,this._resolved,We),Xt(e,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return Z;this._resolved=Vt(this._resolved,this.hass,this._config);const{map:t,profile:e,radarIds:n}=this._resolved;if(!Yt(this.hass,n))return this._renderNotFound();const i=(null==e?void 0:e.label)??"LD2410",r=Ze(this.hass,t,i);return r===Z?Z:G`
      <ha-card .header=${this._config.title??`${i} Gate Energy`}>
        <div class="wrap">${r}</div>
      </ha-card>
    `}_renderNotFound(){var t,e;const n=(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.label)??"LD2410";return G`
      <ha-card .header=${(null===(e=this._config)||void 0===e?void 0:e.title)??`${n} Gate Energy`}>
        <div class="not-found">
          Apollo mmWave: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};Je.styles=[Ge,o`
      .wrap {
        padding: 4px 12px 12px;
      }
      .not-found {
        padding: 12px 16px 16px;
        color: var(--error-color, #db4437);
        font-size: 0.9em;
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
    `],Se([pt({attribute:!1})],Je.prototype,"hass",void 0),Se([vt()],Je.prototype,"_config",void 0),ie("apollo-radar-gate-energy-card",Je),re("apollo-radar-gate-energy-card","Apollo Radar Gate Energy Chart","Per-gate move/still energy chart for Apollo MSR (LD2410) & R PRO (LD2412).");var Ve=.5,Ke=["move","still"],Xe=/* @__PURE__ */new Set(["done","cancelled","failed"]);function Ye(t){return void 0!==t&&Xe.has(t)}function Qe(t){if(!t)return null;const e=new Date(t);return Number.isNaN(e.getTime())?null:e}function tn(t,e){return t.toDateString()===e.toDateString()}var en={hour:"2-digit",minute:"2-digit"},nn={day:"numeric",month:"short"};function rn(t,e=/* @__PURE__ */new Date){const n=Qe(t);if(!n)return t;const i=tn(n,e)?en:{...nn,...en};return new Intl.DateTimeFormat(void 0,i).format(n)}function sn(t){const e=Qe(t);return e?new Intl.DateTimeFormat(void 0,{...nn,...en}).format(e):t}function on(t){if(t>=60&&t%60==0){const e=t/60;return`${e} ${1===e?"minute":"minutes"}`}return`${t} ${1===t?"second":"seconds"}`}function an(t,e){return`${t} ${1===t?e:`${e}s`}`}function ln(t){return Object.keys(t).sort((t,e)=>Number(t)-Number(e))}function dn(t){const e=[];for(const i of["move","still"]){var n;const r=(null===(n=t.peaks)||void 0===n?void 0:n[i])??{},s=ln(r);if(0===s.length)continue;const o=s.map(t=>`G${t} ${r[t]}`).join(" · ");e.push(`Highest so far, ${i}: ${o}`)}return e}var cn="Reading the radar's current thresholds...",un="Checking that the radar accepted the new values...",hn="Restoring saved thresholds...",_n="Finishing...";function pn(t){if("restore"===t.kind)switch(t.status){case"applying":return"refresh"===t.sub_phase?{phase:cn,detail:""}:{phase:hn,detail:`${t.writes_done} of ${t.writes_total}`};case"verifying":return{phase:un,detail:""};case"preparing":return{phase:hn,detail:""};default:return{phase:_n,detail:""}}switch(t.status){case"preparing":return"settle"===t.sub_phase?{phase:"Leave the room now.",detail:""}:"warmup"===t.sub_phase?{phase:"Waiting for gate energy from the radar...",detail:""}:{phase:"Turning on Radar Engineering Mode...",detail:""};case"sampling":return{phase:"Listening to the empty room...",detail:`${t.remaining_s??t.duration_s} s left`};case"applying":return"refresh"===t.sub_phase?{phase:cn,detail:""}:{phase:`Writing ${t.writes_total} thresholds to the radar...`,detail:`${t.writes_done} of ${t.writes_total}`};case"verifying":return{phase:un,detail:""};default:return{phase:_n,detail:""}}}function vn(t){return Number.isFinite(t)?Math.max(0,Math.min(1,t)):0}function fn(t){return null==t?"":String(Math.round(10*t)/10)}function gn(t){return null===t.peak||void 0===t.peak?"":t.flags.includes("spike")?`${fn(t.peak)} (spike seen)`:fn(t.peak)}function mn(t,e){var n;const i=e?null==t||null===(n=t.states)||void 0===n||null===(n=n[e])||void 0===n||null===(n=n.attributes)||void 0===n?void 0:n.max:void 0,r="number"==typeof i?i:"string"==typeof i?parseFloat(i):NaN;return Number.isFinite(r)?r:100}var $n=()=>100;function yn(t,e){return!t.skipped&&!t.flags.includes("unused")&&(null!==t.old&&void 0!==t.old&&null!==t.new&&void 0!==t.new&&(Math.abs(t.old-e)<=Ve&&t.new<e-Ve))}function bn(t,e,n){if("not selected"===t.skipped)return null===t.old?"(not selected)":`${fn(t.old)} (not selected)`;if(t.skipped)return`skipped: ${t.skipped}`;if(null===t.new||void 0===t.new)return"no data";if(t.written&&!1===t.confirmed&&null===t.actual)return"not confirmed (radar offline)";const i=t.flags.includes("off");if(!(null===t.old||Math.abs(t.new-t.old)>Ve))return i?`${fn(t.new)} (off)`:`${fn(t.old)} (unchanged)`;const r=`${fn(t.old)} → ${fn(t.new)}`,s=[];return i&&s.push("off"),yn(t,n)&&s.push("was off"),!e&&t.written&&!1===t.confirmed&&s.push("not confirmed"),s.length?`${r} (${s.join(", ")})`:r}function wn(t,e,n){return{peak:gn(t),text:bn(t,e,n(t.entity_id)),flags:[...t.flags]}}function xn(t){const e=[t.move,t.still].filter(t=>"not selected"!==t.skipped);return e.length>0&&e.every(t=>t.flags.includes("unused"))}function Sn(t){return t.map(t=>`G${t}`).join(", ")}function kn(t,e){return`G${t} ${e} threshold`}function An(t){const e=t.unverified??[];if(0===e.length)return null;const n=e.map(e=>{const n=function(t,e){for(const n of t.gates??[]){if(n.move.entity_id===e)return kn(n.gate,"move");if(n.still.entity_id===e)return kn(n.gate,"still")}return e}(t,e.entity_id);return null===e.actual||void 0===e.actual?`${n} could not be read (radar offline)`:`${n} reads back ${fn(e.actual)} (asked for ${fn(e.asked)})`});return`${an(e.length,"value")} could not be confirmed: ${n.join(", ")}. Check the Move / Still Thresholds cards.`}function En(t){const e=[],n=t.warnings??[];for(const i of n)if("presence"===i){const n=Math.round(100*(t.presence_fraction??0));e.push(`The radar reported someone present for ${n}% of the listen. If someone was in the room, even sitting still, press Undo and run it again.`)}else if("radar_unavailable"===i)e.push("The radar was unavailable for part of the listen; gates with too few readings were left as they were.");else if("unverified"===i){const n=An(t);n&&e.push(n)}else if("gate_off"===i)for(const n of t.gates_off??[])e.push(`The ${kn(n.gate,n.channel)} is now off (its background peaked at ${fn(n.peak)}). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty.`);if(!n.includes("unverified")&&"restore"===t.kind){const n=An(t);n&&e.push(n)}return e}function Rn(t){return"move"===t?"Move Thresholds":"Still Thresholds"}function Mn(t,e=$n){const n="preview"===t.outcome;if("calibrate"!==t.kind)return[];if(!n&&"applied"!==t.outcome&&"partial"!==t.outcome)return[];const i=[];for(const r of t.gates??[])for(const t of Ke){const s=r[t],o=e(s.entity_id);if(!yn(s,o))continue;if(!(n||s.written&&!1!==s.confirmed))continue;const a=kn(r.gate,t),l=fn(o),d=Rn(t);i.push(n?`The ${a} is off (set to ${l}) and calibration would turn it back on (would set ${fn(s.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card after you calibrate.`:`The ${a} was off (set to ${l}) and calibration turned it back on (now ${fn(s.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card, or press Undo to put back all your previous values.`)}return i}function zn(t,e){var n;if(!e)return null;const i=parseFloat((null===(n=t.states[e])||void 0===n?void 0:n.state)??"");return Number.isFinite(i)?Math.trunc(i):null}function Tn(t,e,n,i){if("ld2412"===t)return!(null!==e.min_gate&&n<e.min_gate)&&(null===e.max_gate||n<=e.max_gate);const r="move"===i?e.max_move_gate:e.max_still_gate;return null===r||n<=r}function Cn(t,e,n,i){var r;if(!t||"calibrate"!==t.kind)return!1;if("applied"!==t.outcome&&"partial"!==t.outcome)return!1;if((t.gates_off??[]).some(t=>t.gate===e&&t.channel===n))return!0;const s=null===(r=t.gates)||void 0===r||null===(r=r.find(t=>t.gate===e))||void 0===r?void 0:r[n];return!(!(null==s?void 0:s.written)||null===s.new||void 0===s.new)&&Math.abs(s.new-i)<=Ve}function Ln(t,e){let n=0;for(let i=e;i<t.length;i++){if("calibrate"===t[i].reason)return n%2==0?"previous":"calibrated";n+=1}return null}function On(t,e=/* @__PURE__ */new Date){const n=t[0];if(!n)return"Nothing to restore yet";switch(Ln(t,0)){case"previous":return"Undo (restore your previous values)";case"calibrated":return"Redo (put the calibrated values back)";default:return`Restore the values saved at ${rn(n.taken_at,e)}`}}function In(t,e=/* @__PURE__ */new Date){const n=t[0];if(!n)return;const i=Qe(n.taken_at),r=rn(n.taken_at,e);return i&&tn(i,e)?`Saved at ${r}`:`Saved ${r}`}function Dn(t,e="changed"){const n=t.changed??0;return`${n} of ${n+(t.unchanged??0)} thresholds ${e}`}function Pn(t){const e=t.writes_done??0;return 0===e?"Stopped. Nothing was changed.":`Stopped after ${e} of ${t.writes_total??e} values were written. Undo restores the saved values.`}function Nn(t,e=/* @__PURE__ */new Date){if("failed"===t.status||"failed"===t.outcome)return Bn(t);if("cancelled"===t.outcome)return Pn(t);const n=rn(t.finished_at,e);if("restore"===t.kind){const e=t.restored??0,i=t.unchanged??0;return`Restored ${an(e,"value")} at ${n}, ${i} unchanged.`}const i=an(t.samples??0,"sample");return"preview"===t.outcome?`Previewed at ${n} from ${i}. ${Dn(t,"would change")}.`:`Calibrated at ${n} from ${i}. ${Dn(t)}.`}function Un(t){const e=t.writes_done??0;return 0===e?". Nothing was changed.":` after ${e} of ${t.writes_total??e} values were written.`}var Fn=/nothing was changed/i;function Bn(t){var e;const n=(null===(e=t.error)||void 0===e?void 0:e.message)??"Unknown error.",i="restore"===t.kind?"Restore failed: ":"Calibration failed: ";return 0!==(t.writes_done??0)||Fn.test(n)?`${i}${n}`:`${i}${n} Nothing was changed.`}function Hn(t,e){const n=t.restored_from;if((null==n?void 0:n.id)||(null==n?void 0:n.taken_at))return n;if(t.snapshot_id){const n=e.findIndex(e=>e.id===t.snapshot_id),i=n>=0?e[n+1]:void 0;return i?{id:i.id,taken_at:i.taken_at}:null}const i=e[0];return i?{id:i.id,taken_at:i.taken_at}:null}function jn(t,e,n=/* @__PURE__ */new Date){const i=Hn(t,e),r=(null==i?void 0:i.id)?function(t,e,n){const i=e.findIndex(t=>t.id===n);if(i<0)return null;let r=0;if(t.snapshot_id){const n=e.findIndex(e=>e.id===t.snapshot_id);if(n<0)return null;r=n+1}return i===r?Ln(e,i):null}(t,e,i.id):null;if("previous"===r)return"Restored your previous values.";if("calibrated"===r)return"Restored the calibrated values.";const s=null==i?void 0:i.taken_at;return s?`Restored the thresholds from ${rn(s,n)}.`:"Restored the saved thresholds."}function Gn(t){const e=t.missing??[];return e.length?`Not found any more: ${e.join(", ")}.`:null}var Wn={observedFinish:null,lastJobId:null,lastJobTerminal:!1};var qn="apollo-radar-calibrate-card",Zn="Calibrate with empty room";function Jn(t){const e=/^(.+?) (\([^()]*\))$/.exec(t);return e?G`<span class="value">${e[1]}</span> <span class="note">${e[2]}</span>`:G`<span class="value">${t}</span>`}function Vn(t){try{const e=t();e&&"function"==typeof e.catch&&e.catch(()=>{})}catch{}}var Kn=class extends ct{constructor(...t){super(...t),this._local=Wn,this._loadState="loading",this._loadError="",this._showLastResult=!1,this._readingSettings=!1,this._unsubscribe=null,this._serial=0,this._pending=!1,this._retryTimer=null,this._retryIndex=0,this._onReady=()=>this._reopen(),this._onDisconnected=()=>this._cancelRetry(),this._entryFeed=null,this._entryFeedSerial=0,this._lastJobApply=null,this._readSettingsToken=0,this._maxOf=t=>mn(this.hass,t)}setConfig(t){this._config=t}getCardSize(){return 6}static getStubConfig(){return{type:`custom:${qn}`}}connectedCallback(){super.connectedCallback(),this._attachConnectionListeners(),this._open()}disconnectedCallback(){super.disconnectedCallback(),this._cancelReadSettings(),this._detachConnectionListeners(),this._closeEntryFeed(),this._close()}shouldUpdate(t){if(1!==t.size||!t.has("hass"))return!0;const e=t.get("hass");return!(e&&this.hass&&this._config)||(e.entities!==this.hass.entities||e.devices!==this.hass.devices||e.connection!==this.hass.connection||(this._resolved=Vt(this._resolved,this.hass,this._config),Kt(e,this.hass,this._watchedIds())))}willUpdate(t){if(!this.hass||!this._config)return;if(!t.has("hass")&&!t.has("_config"))return;this._resolved=Vt(this._resolved,this.hass,this._config);const e=function(t,e,n){if(e.device_id)return e.device_id;for(const r of Wt(n)){var i;const e=null===(i=t.entities[r])||void 0===i?void 0:i.device_id;if(e)return e}}(this.hass,this._config,this._resolved.map);this._attachConnectionListeners(),e!==this._deviceId&&(this._deviceId=e,this._payload=void 0,this._local=Wn,this._failure=void 0,this._stopError=void 0,this._turnOffError=void 0,this._lastJobApply=null,this._showLastResult=!1,this._cancelReadSettings(),this._retryIndex=0,this._loadState="loading",this._close()),this._open()}_watchedIds(){var t,e;const n=null===(t=this._resolved)||void 0===t?void 0:t.map;if(!n)return[];const i=null===(e=this._payload)||void 0===e?void 0:e.entities;return[n.engineering_mode,...n.move_threshold,...n.still_threshold,n.max_move_distance,n.max_still_distance,n.radar_target,n.background_correction_status,null==i?void 0:i.engineering_mode,null==i?void 0:i.background_status].filter(t=>!!t)}_apiHass(){var t;const e=this.hass;if((null==e?void 0:e.callService)&&(null===(t=e.connection)||void 0===t?void 0:t.subscribeMessage))return e}_open(){if(this._openEntryFeed(),!this.isConnected||this._unsubscribe||this._pending||this._retryTimer)return;const t=this._apiHass(),e=this._deviceId;if(!t||!e)return;const n=++this._serial;this._pending=!0,async function(t,e,n){return t.connection.subscribeMessage(n,{type:Ee,device_id:e})}(t,e,t=>{n===this._serial&&this._applyPayload(t)}).then(t=>{n===this._serial?(this._pending=!1,this._unsubscribe=t,this._retryIndex=0,"idle"!==this._loadState&&(this._loadState=this._payload?"idle":"loading")):Vn(t)},t=>{n===this._serial&&(this._pending=!1,this._failOpen(t))})}_failOpen(t){const e=null==t?void 0:t.code;if("not_loaded"===e&&this._retryIndex<Re.length){const t=Re[this._retryIndex];return this._retryIndex+=1,this._loadState="retrying",void(this._retryTimer=setTimeout(()=>{this._retryTimer=null,this._open()},t))}this._loadState="not_loaded"===e?"not_loaded":"error",this._loadError=De(t)}_close(){this._serial+=1,this._pending=!1,this._cancelRetry();const t=this._unsubscribe;this._unsubscribe=null,t&&Vn(t)}_cancelRetry(){null!==this._retryTimer&&(clearTimeout(this._retryTimer),this._retryTimer=null)}_reopen(){this._retryIndex=0,this._close(),this._open()}_openEntryFeed(){const t=this._apiHass(),e=null==t?void 0:t.connection;if(!(this.isConnected&&t&&e&&this._deviceId))return;if(this._entryFeedConnection===e)return;this._closeEntryFeed(),this._entryFeedConnection=e;const n=++this._entryFeedSerial;(async function(t,e){try{return await t.connection.subscribeMessage(t=>{(Array.isArray(t)?t:[t]).some(t=>{var e,n;return("updated"===(null==t?void 0:t.type)||"added"===(null==t?void 0:t.type))&&"apollo_mmwave"===(null==t||null===(e=t.entry)||void 0===e?void 0:e.domain)&&"loaded"===(null==t||null===(n=t.entry)||void 0===n?void 0:n.state)})&&e()},{type:"config_entries/subscribe"})}catch{return null}})(t,()=>{n===this._entryFeedSerial&&this._reopen()}).then(t=>{n===this._entryFeedSerial?this._entryFeed=t:t&&Vn(t)})}_closeEntryFeed(){this._entryFeedSerial+=1,this._entryFeedConnection=void 0;const t=this._entryFeed;this._entryFeed=null,t&&Vn(t)}_retryNow(){this._retryIndex=0,this._loadState="loading",this._close(),this._open()}_attachConnectionListeners(){var t;const e=null===(t=this.hass)||void 0===t?void 0:t.connection;this.isConnected&&e&&e!==this._listenedConnection&&(this._detachConnectionListeners(),e.addEventListener&&(e.addEventListener("ready",this._onReady),e.addEventListener("disconnected",this._onDisconnected),this._listenedConnection=e))}_detachConnectionListeners(){const t=this._listenedConnection;this._listenedConnection=void 0,(null==t?void 0:t.removeEventListener)&&(t.removeEventListener("ready",this._onReady),t.removeEventListener("disconnected",this._onDisconnected))}_applyPayload(t){var e;const n=null===(e=this._payload)||void 0===e||null===(e=e.job)||void 0===e?void 0:e.job_id;this._local=function(t,e){var n;const i=e.job;if(i){const e=Ye(i.status);return{observedFinish:e?i.job_id:t.observedFinish,lastJobId:i.job_id,lastJobTerminal:e}}let r=t.observedFinish;return null===t.lastJobId||t.lastJobTerminal||(null===(n=e.last_result)||void 0===n?void 0:n.job_id)!==t.lastJobId||(r=t.lastJobId),{observedFinish:r,lastJobId:null,lastJobTerminal:!1}}(this._local,t),this._payload=t,this._loadState="idle";const i=t.job;i&&(this._lastJobApply={jobId:i.job_id,apply:i.apply}),i&&!Ye(i.status)&&(this._failure=void 0),i&&!Ye(i.status)&&i.job_id===n||(this._stopError=void 0)}_start(t){var e;const n=this._apiHass(),i=this._deviceId;if(!n||!i)return;this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,this._local={...this._local,observedFinish:null};const r={...(null===(e=this._config)||void 0===e?void 0:e.calibration)??{}};t||(r.apply=!1),function(t,e,n={}){return Te(t,Ae,"calibrate_gates",{device_id:e,...Ce(n)})}(n,i,r).catch(e=>this._showServiceFailure("Calibration failed: ",e,()=>this._start(t)))}async _showServiceFailure(t,e,n){const i=this._deviceId,r=await Ne(this.hass??{},e);i===this._deviceId&&(this._failure={prefix:t,message:r,retry:n,code:Oe(e)})}_stop(){const t=this._apiHass(),e=this._deviceId;t&&e&&(this._stopError=void 0,function(t,e){return Te(t,Ae,"cancel_calibration",{device_id:e})}(t,e).catch(async t=>{const n=await Ne(this.hass??{},t);e===this._deviceId&&(this._stopError=`Could not stop the calibration: ${n}`)}))}_undo(t){const e=this._apiHass(),n=this._deviceId;e&&n&&(this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,function(t,e,n){return Te(t,Ae,"restore_gate_thresholds",{device_id:e,...n?{snapshot_id:n}:{}})}(e,n,t).catch(e=>this._showServiceFailure("Restore failed: ",e,()=>this._undo(t))))}_turnOff(){const t=this._apiHass(),e=this._engineeringSwitchId();if(!t||!e)return;const n=this._deviceId;this._turnOffError=void 0,function(t,e,n){return Te(t,"switch",n?"turn_on":"turn_off",{entity_id:e})}(t,e,!1).catch(async t=>{const e=await Ne(this.hass??{},t);n===this._deviceId&&(this._turnOffError=`Could not turn Radar Engineering Mode off: ${e}`)})}_readSettingsThenRetry(t,e){const n=this._apiHass(),i=this._deviceId;if(!n||!i||this._readingSettings)return;const r=++this._readSettingsToken,s=()=>r===this._readSettingsToken&&i===this._deviceId;this._readingSettings=!0,this._readSettingsError=void 0,function(t,e){return Te(t,"button","press",{entity_id:e})}(n,t).then(()=>{setTimeout(()=>{var t;if(!s())return;this._readingSettings=!1;const n=null===(t=this._payload)||void 0===t?void 0:t.job;n&&!Ye(n.status)||e()},3e3)},async t=>{const e=await Ne(this.hass??{},t);s()&&(this._readingSettings=!1,this._readSettingsError=`Could not ask the radar for its settings: ${e}`)})}_cancelReadSettings(){this._readSettingsToken+=1,this._readingSettings=!1,this._readSettingsError=void 0}_closeResult(){this._cancelReadSettings(),this._failure=void 0,this._local={...this._local,observedFinish:null}}_profileKey(){var t,e;return(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.key)??(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.profile)}_engineeringSwitchId(){var t,e;return(null===(t=this._resolved)||void 0===t?void 0:t.map.engineering_mode)??(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.engineering_mode)??void 0}_engineeringOn(){var t,e;const n=this._engineeringSwitchId(),i=n&&this.hass?null===(t=this.hass.states[n])||void 0===t?void 0:t.state:void 0;return void 0!==i?"on"===i:!!(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.engineering_mode_on)}_backgroundOn(){var t,e,n,i;const r=(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.background_status)??(null===(e=this._resolved)||void 0===e?void 0:e.map.background_correction_status),s=r&&this.hass?null===(n=this.hass.states[r])||void 0===n?void 0:n.state:void 0;return void 0!==s?"on"===s:!!(null===(i=this._payload)||void 0===i||null===(i=i.entities)||void 0===i?void 0:i.background_status_on)}_queryParamsButtonId(){var t,e,n;const i=(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.query_params_button)??(null===(e=this._resolved)||void 0===e?void 0:e.map.query_params);return i&&(null===(n=this.hass)||void 0===n?void 0:n.states[i])?i:void 0}_warningLines(t){return[...En(t),...Mn(t,this._maxOf)]}_online(){var t;if(!this.hass||!this._resolved)return!1;if(!Yt(this.hass,this._resolved.ids))return!1;const e=this._engineeringSwitchId(),n=e?null===(t=this.hass.states[e])||void 0===t?void 0:t.state:void 0;return void 0!==n&&"unavailable"!==n}render(){return this.hass&&this._config?(this._resolved=Vt(this._resolved,this.hass,this._config),G`
      <ha-card .header=${this._config.title??"Auto-calibrate"}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `):Z}_renderSubtitle(){var t,e;const n=this._deviceId;if(!n||!this.hass)return Z;const i=(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.label)??(null===(e=this._profileKey())||void 0===e?void 0:e.toUpperCase()),r=this.hass.devices[n],s=(null==r?void 0:r.name_by_user)||(null==r?void 0:r.name);return i||s?G`<div class="subtitle">${[i,s].filter(Boolean).join(" · ")}</div>`:Z}_renderBody(){var t;if(!this._deviceId)return G`<p class="hint">${"Add device_id to this card's configuration to enable auto-calibration."}</p>`;if("retrying"===this._loadState)return G`<div class="status" aria-live="polite"><p>${"Apollo mmWave is still loading..."}</p></div>`;if("not_loaded"===this._loadState||"error"===this._loadState){const t="not_loaded"===this._loadState?"Apollo mmWave is not loaded, so calibration is unavailable.":this._loadError;return G`
        <div class="section">
          <div class="status" aria-live="polite"><p class="error">${t}</p></div>
          <div class="buttons">
            <button type="button" class="secondary" @click=${this._retryNow}>Retry</button>
          </div>
        </div>
      `}const e=this._payload;if(!e)return G`<div class="status" aria-live="polite"><p class="hint">Loading...</p></div>`;const n=e.job;return n&&!Ye(n.status)?this._renderRunning(n):this._failure?this._renderFailure(this._failure,e):n&&(null===(t=e.last_result)||void 0===t?void 0:t.job_id)!==n.job_id?this._renderFinishing():function(t,e){var n;return null!==t.observedFinish&&!(e.job&&!Ye(e.job.status))&&(null===(n=e.last_result)||void 0===n?void 0:n.job_id)===t.observedFinish}(this._local,e)&&e.last_result?this._renderResult(e.last_result,e):this._renderIdle(e)}_renderRunning(t){const e=function(t,e){const n=function(t){return"ld2412"===t?"Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes.":"Leave Radar Engineering Mode on until this finishes."}(e),{phase:i,detail:r}=pn(t),s=r?`${i} ${r}`:i;if("restore"===t.kind)return[s];switch(t.status){case"preparing":return"engineering"===t.sub_phase?[s]:"settle"===t.sub_phase?[s,`Listening starts in ${t.remaining_s??t.settle_s} s.`,n]:[s,n];case"sampling":return[s,`Keep the room empty. ${an(t.samples,"sample")} so far.`,...dn(t),n];case"applying":return"refresh"===t.sub_phase?[s]:[s,"Values already written stay until you undo."];default:return[s]}}(t,this._profileKey()),{phase:n,detail:i}=pn(t),r="calibrate"===t.kind&&("preparing"===t.status||"sampling"===t.status||"applying"===t.status);return G`
      <div class="section">
        <div class="status">
          <p class="headline"><span class="phase" aria-live="polite">${n}</span>${i?` ${i}`:""}</p>
          ${e.slice(1).map(t=>G`<p>${t}</p>`)}
        </div>
        ${this._renderBar(t)}
        ${r?G`
              <div class="buttons">
                <button
                  type="button"
                  class="secondary"
                  ?disabled=${!function(t){return!(!t||"calibrate"!==t.kind||t.cancel_requested||"preparing"!==t.status&&"sampling"!==t.status&&"applying"!==t.status)}(t)}
                  @click=${this._stop}
                >
                  ${t.cancel_requested?"Stopping...":"Stop"}
                </button>
              </div>
            `:Z}
        ${this._stopError?G`<p class="error" role="alert">${this._stopError}</p>`:Z}
      </div>
    `}_renderBar(t){const{fraction:e,label:n}=function(t){return"preparing"===t.status&&"settle"===t.sub_phase&&t.settle_s>0?{fraction:vn(t.elapsed_s/t.settle_s),label:`${t.remaining_s??t.settle_s} s`}:"sampling"===t.status&&t.duration_s>0?{fraction:vn(t.elapsed_s/t.duration_s),label:`${t.remaining_s??t.duration_s} s left`}:"applying"===t.status&&"refresh"!==t.sub_phase&&t.writes_total>0?{fraction:vn(t.writes_done/t.writes_total),label:`${t.writes_done} of ${t.writes_total}`}:{fraction:null,label:""}}(t),i=null===e?100:Math.round(100*e);return G`
      <div
        class="bar ${null===e?"indeterminate":""}"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${null===e?Z:i}
        aria-label=${n||Z}
      >
        <div class="fill" style="width:${i}%"></div>
      </div>
    `}_renderFinishing(){return G`
      <div class="section">
        <div class="status" aria-live="polite"><p class="headline">Finishing...</p></div>
        <div class="bar indeterminate" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="fill" style="width:100%"></div>
        </div>
      </div>
    `}_closeButton(){return G`<button type="button" class="text" @click=${this._closeResult}>Close</button>`}_renderFailure(t,e){return G`
      <div class="section">
        ${this._renderBanner(e)}
        <div class="status" aria-live="polite">
          <p class="error">${t.prefix}${t.message}</p>
          ${this._renderReadSettingsLines(t.code)}
        </div>
        <div class="buttons">
          ${this._renderRetryButton(t.code,t.retry)} ${this._closeButton()}
        </div>
      </div>
    `}_renderReadSettingsLines(t){if("thresholds_not_numeric"!==t)return Z;const e=this._queryParamsButtonId()?"":"Open the radar's device page, press its Query Params button in the Diagnostic section, wait a few seconds, then try again.";return G`<div class="read-settings">
      ${e?G`<p>${e}</p>`:Z}
      ${this._readingSettings?G`<p>${"Reading settings from the radar..."}</p>`:Z}
      ${this._readSettingsError?G`<p class="error" role="alert">${this._readSettingsError}</p>`:Z}
    </div>`}_renderRetryButton(t,e){const n="thresholds_not_numeric"===t?this._queryParamsButtonId():void 0;return n?G`<button
      type="button"
      class="primary"
      ?disabled=${this._readingSettings}
      @click=${()=>this._readSettingsThenRetry(n,e)}
    >
      ${"Read settings from the radar"}
    </button>`:G`<button type="button" class="primary" @click=${e}>Try again</button>`}_renderResult(t,e){const n=e.snapshots??[],i=this._renderBanner(e),r=n.length?G`<button
          type="button"
          class="secondary"
          title=${In(n)??Z}
          @click=${()=>this._undo()}
        >
          ${On(n)}
        </button>`:Z,s=t=>G`<button type="button" class="primary" @click=${()=>this._start(!0)}>${t}</button>`;var o;if("failed"===t.status||"failed"===t.outcome)return G`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="error">${Bn(t)}</p>
            ${this._renderReadSettingsLines(null===(o=t.error)||void 0===o?void 0:o.code)}
          </div>
          <div class="buttons">
            ${function(t){return(t.writes_done??0)>0&&!!t.snapshot_id}(t)?r:Z} ${this._renderTryAgain(t,n)}
            ${this._closeButton()}
          </div>
        </div>
      `;if("cancelled"===t.outcome){const e=t.writes_done??0;return G`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite"><p>${Pn(t)}</p></div>
          <div class="buttons">
            ${e>0?r:Z} ${s(Zn)} ${this._closeButton()}
          </div>
        </div>
      `}if("restore"===t.kind){const o=Gn(t);return G`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="headline">${jn(t,n)}</p>
            ${o?G`<p>${o}</p>`:Z}
            ${this._warningLines(t).map(t=>G`<p class="warning">${t}</p>`)}
          </div>
          ${this._renderIdleBody(e)}
          <div class="buttons">${r} ${s(Zn)}</div>
        </div>
      `}return"preview"===t.outcome?G`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="headline">Preview: no threshold was changed.</p>
            <p>These are the thresholds calibration would set:</p>
          </div>
          ${this._renderTable(t)}
          ${this._warningLines(t).map(t=>G`<p class="warning">${t}</p>`)}
          <div class="buttons">${s("Calibrate and apply")} ${this._closeButton()}</div>
        </div>
      `:G`
      <div class="section">
        ${i}
        <div class="status" aria-live="polite">
          <p class="headline">${function(t){return"partial"===t.outcome?`Thresholds updated, ${(t.unverified??[]).length} could not be confirmed`:"Thresholds updated"}(t)}</p>
          <p>${Nn(t)}</p>
        </div>
        ${this._renderTable(t)}
        ${this._warningLines(t).map(t=>G`<p class="warning">${t}</p>`)}
        <p>${"Now walk around, then sit still for a minute: the Radar Target row in Target / Occupancy should stay on the whole time you are in the room and turn off a few seconds after you leave (Radar Timeout)."}</p>
        <div class="buttons">${r} ${s("Calibrate again")} ${this._closeButton()}</div>
      </div>
    `}_renderTryAgain(t,e){var n;let i;if("restore"===t.kind){const n=Hn(t,e);if(!(null==n?void 0:n.id))return Z;const r=n.id;i=()=>this._undo(r)}else{const e=this._lastJobApply,n=!e||e.jobId!==t.job_id||e.apply;i=()=>this._start(n)}return this._renderRetryButton(null===(n=t.error)||void 0===n?void 0:n.code,i)}_renderTable(t){const e=function(t,e=$n){const n="preview"===t.outcome;return(t.gates??[]).map(t=>({gate:t.gate,label:`G${t.gate}`,move:wn(t.move,n,e),still:wn(t.still,n,e),unused:xn(t)}))}(t,this._maxOf),n=function(t){const e=t.gates??[],n=[];if("ld2412"===t.profile){const i=e.filter(t=>t.move.flags.includes("unused")||t.still.flags.includes("unused")),r=t.min_gate??null,s=t.max_gate??null,o=i.filter(t=>null!==r&&t.gate<r).map(t=>t.gate),a=i.filter(t=>null!==s&&t.gate>s).map(t=>t.gate);return o.length&&n.push(`${Sn(o)}: not used (below Min Gate ${r})`),a.length&&n.push(`${Sn(a)}: not used (beyond Max Gate ${s})`),n}const i=e.filter(t=>t.move.flags.includes("unused")).map(t=>t.gate),r=e.filter(t=>t.still.flags.includes("unused")).map(t=>t.gate);return i.length&&n.push(`${Sn(i)}: not used (beyond Max Move Gate ${t.max_move_gate??"?"})`),r.length&&n.push(`${Sn(r)}: not used (beyond Max Still Gate ${t.max_still_gate??"?"})`),n}(t),i=t=>t.includes("unused")?"unused":"";return G`
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
              ${e.map(t=>G`
      <tr class=${t.unused?"unused":""}>
        <th scope="row">${t.label}</th>
        <td class=${i(t.move.flags)}>${t.move.peak}</td>
        <td class="threshold ${i(t.move.flags)}">${Jn(t.move.text)}</td>
        <td class=${i(t.still.flags)}>${t.still.peak}</td>
        <td class="threshold ${i(t.still.flags)}">${Jn(t.still.text)}</td>
      </tr>
    `)}
            </tbody>
          </table>
        </div>
        ${n.map(t=>G`<p class="footnote">${t}</p>`)}
      </div>
    `}_renderIdle(t){const e=this._online(),n=t.snapshots??[];return G`
      <div class="section">
        ${this._renderBanner(t)}
        ${e?this._renderIdleBody(t):G`<div class="status" aria-live="polite"><p>${"Radar is offline. Calibration needs the radar online and its gate entities enabled."}</p></div>`}
        ${this._renderIdleButtons(t,e)}
        ${this._renderFooter(t,n)}
      </div>
    `}_renderIdleBody(t){var e,n;const i=(null===(e=this._config)||void 0===e||null===(e=e.calibration)||void 0===e?void 0:e.settle_s)??15,r=(null===(n=this._config)||void 0===n||null===(n=n.calibration)||void 0===n?void 0:n.duration_s)??60,s="ld2412"===this._profileKey(),o=this._engineeringOn()?"Radar Engineering Mode is already on and will stay on.":"Home Assistant turns Radar Engineering Mode on for the listen and back off afterward.",a=!(!this.hass||!this._resolved)&&function(t,e,n,i=[]){if("ld2410"!==n||i.length>0)return!1;const r=wt,s=(e,n)=>{if(0===n.length)return!1;for(let r=0;r<n.length;r++){var i;const s=e[r];if(!s)return!1;const o=null===(i=t.states[s])||void 0===i?void 0:i.state;if(void 0===o)return!1;const a=parseFloat(o);if(!Number.isFinite(a)||a!==n[r])return!1}return!0};return s(e.move_threshold,r.move)&&s(e.still_threshold,r.still)}(this.hass,this._resolved.map,this._profileKey(),t.snapshots??[]),l=this._offGatesLine(t);return G`
      <div class="idle-body">
        <p>${function(t,e){const n=`listens for ${on(e)}, then sets every gate's move and still threshold a margin above the background it heard.`;return`Teach the radar what your empty room looks like. ${t>0?`It counts down ${on(t)} so you can leave, ${n}`:`It ${n}`} Your current thresholds are saved first, so you can undo.`}(i,r)}</p>
        <ul>
        <li>Nobody in the radar's view: people, pets, robot vacuums.</li>
        <li>
          Fans, curtains and plants that normally move are part of the background. Leave them
          as they usually are.
        </li>
        <li>${o}</li>
        ${s?G`<li>
              LD2412: run Start Dynamic Background Correction (Controls card) first with the
              room empty and wait for its status to turn off. Calibrate afterward.
            </li>`:Z}
        ${s&&this._backgroundOn()?G`<li>
              Background correction is running on the LD2412. Wait for its status to turn off.
            </li>`:Z}
        </ul>
        ${l?G`<p class="warning">${l}</p>`:Z}
        ${a?G`<p class="hint">${"These look like factory thresholds. Calibrating sets them for your room."}</p>`:Z}
      </div>
    `}_offGatesLine(t){if(!this.hass||!this._resolved)return null;const e=this._resolved.map,n=this._profileKey(),i=function(t,e,n,i){return"ld2412"===n?{max_move_gate:null,max_still_gate:null,min_gate:zn(t,e.max_still_distance)??(null==i?void 0:i.min_gate)??null,max_gate:zn(t,e.max_move_distance)??(null==i?void 0:i.max_gate)??null}:{max_move_gate:zn(t,e.max_move_distance)??(null==i?void 0:i.max_move_gate)??null,max_still_gate:zn(t,e.max_still_distance)??(null==i?void 0:i.max_still_gate)??null,min_gate:null,max_gate:null}}(this.hass,e,n,t.entities);return function(t){if(0===t.length)return null;const e=t=>`G${t.gate} ${t.channel}`;if(1===t.length){const e=t[0];return`The ${kn(e.gate,e.channel)} is off (set to ${fn(e.max)}). Calibrating will turn it back on.`}const n=t[0].max;return(t.every(t=>t.max===n)?`These thresholds are off (set to ${fn(n)}): ${t.map(e).join(", ")}.`:`These thresholds are off: ${t.map(t=>`${e(t)} (set to ${fn(t.max)})`).join(", ")}.`)+" Calibrating will turn them back on."}(function(t,e,n,i,r){const s=[],o=Math.max(e.move_threshold.length,e.still_threshold.length);for(let l=0;l<o;l++)for(const o of Ke){var a;if("ld2410"===n&&"still"===o&&l<=1)continue;if(!Tn(n,i,l,o))continue;const d=("move"===o?e.move_threshold:e.still_threshold)[l],c=("move"===o?e.move_energy:e.still_energy)[l];if(!d||!c||void 0===t.states[c])continue;const u=parseFloat((null===(a=t.states[d])||void 0===a?void 0:a.state)??"");if(!Number.isFinite(u))continue;const h=mn(t,d);Math.abs(u-h)>Ve||Cn(r,l,o,h)||s.push({gate:l,channel:o,max:h})}return s}(this.hass,e,n,i,t.last_result))}_renderIdleButtons(t,e){const n=function(t,e,n=(()=>{var e;return null==t||null===(e=t.entities)||void 0===e?void 0:e.background_status_on})()??!1){return!(!e||!(null==t?void 0:t.entities)||t.job||!t.entities.engineering_mode||n)}(t,e,this._backgroundOn())&&!!this._apiHass();return G`
      <div class="actions">
        <div class="buttons">
          <button type="button" class="primary" ?disabled=${!n} @click=${()=>this._start(!0)}>
            ${Zn}
          </button>
          <button type="button" class="text" ?disabled=${!n} @click=${()=>this._start(!1)}>
            Preview only
          </button>
        </div>
        <p class="helper">${"Computes new thresholds without changing any of them. Radar Engineering Mode is still turned on for the listen."}</p>
      </div>
    `}_renderFooter(t,e){const n=t.last_result;if(!e.length&&!n)return Z;const i=function(t){const e=t[0];return e&&null!==Ln(t,0)?`Saved ${sn(e.taken_at)}.`:null}(e);return G`
      <div class="footer">
        ${e.length?G`
              <div class="last">
                ${n?G`<p>${function(t){const e=sn(t.finished_at),n="restore"===t.kind?"restore":!1===t.apply?"preview":"calibration";switch(t.outcome){case"applied":case"partial":return`Last calibrated ${e}, ${Dn(t)}.`;case"restored":return`Last restored ${e}.`;case"preview":return`Last previewed ${e}.`;case"cancelled":return`Last ${n} ${e} was stopped${Un(t)}`;default:var i;return"cancelled_by_shutdown"===(null===(i=t.error)||void 0===i?void 0:i.code)?`Last ${n} ${e} was stopped by a Home Assistant restart${Un(t)}`:`Last ${n} ${e} failed${Un(t)}`}}(n)}</p>`:Z}
                <div class="buttons">
                  <button
                    type="button"
                    class="secondary"
                    title=${In(e)??Z}
                    @click=${()=>this._undo()}
                  >
                    ${On(e)}
                  </button>
                </div>
                ${i?G`<p class="helper">${i}</p>`:Z}
              </div>
            `:Z}
        ${n?G`
              <div class="stored-toggle">
                <div class="buttons">
                  <button
                    type="button"
                    class="text"
                    aria-expanded=${this._showLastResult?"true":"false"}
                    @click=${()=>this._showLastResult=!this._showLastResult}
                  >
                    ${this._showLastResult?"Hide last result":"Show last result"}
                  </button>
                </div>
                ${this._showLastResult?this._renderStoredResult(n):Z}
              </div>
            `:Z}
      </div>
    `}_renderStoredResult(t){if("failed"===t.status||"failed"===t.outcome)return G`<div class="stored"><p class="error">${Bn(t)}</p></div>`;const e=this._warningLines(t).map(t=>G`<p class="warning">${t}</p>`);if("restore"===t.kind)return G`<div class="stored">
        ${function(t){const e=[Nn(t)],n=Gn(t);return n&&e.push(n),e}(t).map(t=>G`<p>${t}</p>`)} ${e}
      </div>`;const n=(t.gates??[]).length>0;return G`<div class="stored">
      <p>${Nn(t)}</p>
      ${n?this._renderTable(t):Z} ${e}
    </div>`}_renderBanner(t){const e=t.interrupted;if(!e)return Z;const n=this._engineeringOn()&&("engineering"===e.phase||e.left_on),i="applying"===e.phase;if(!n&&!i)return Z;const r=e.left_on?"The last calibration could not turn Radar Engineering Mode back off (the radar was offline).":"restore"===e.kind?"A restore was interrupted by a restart.":"A calibration was interrupted by a restart.",s=t.snapshots??[],o=s.find(t=>t.id===e.snapshot_id)??s[0],a=o?rn(o.taken_at):"the start";return G`
      <div class="banner" role="status">
        <p>${r}</p>
        ${n?G`<p>
              Radar Engineering Mode may still be on.
              <button type="button" class="secondary" @click=${this._turnOff}>Turn it off</button>
            </p>`:Z}
        ${n&&this._turnOffError?G`<p class="error" role="alert">${this._turnOffError}</p>`:Z}
        ${i?G`<p>
              Some thresholds may have been written. Undo restores the values saved at
              ${a}.
              <button type="button" class="secondary" ?disabled=${!o} @click=${()=>this._undo()}>
                Undo
              </button>
            </p>`:Z}
      </div>
    `}};Kn.styles=o`
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
    /* A threshold cell may wrap, but only between its value and its note,
       so "(was off)" drops under "100 → 15" on a narrow card instead of
       pushing the column out of view. */
    td.threshold {
      white-space: normal;
    }
    td.threshold .value,
    td.threshold .note {
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
  `,Se([pt({attribute:!1})],Kn.prototype,"hass",void 0),Se([vt()],Kn.prototype,"_config",void 0),Se([vt()],Kn.prototype,"_payload",void 0),Se([vt()],Kn.prototype,"_local",void 0),Se([vt()],Kn.prototype,"_loadState",void 0),Se([vt()],Kn.prototype,"_loadError",void 0),Se([vt()],Kn.prototype,"_failure",void 0),Se([vt()],Kn.prototype,"_stopError",void 0),Se([vt()],Kn.prototype,"_turnOffError",void 0),Se([vt()],Kn.prototype,"_showLastResult",void 0),Se([vt()],Kn.prototype,"_readingSettings",void 0),Se([vt()],Kn.prototype,"_readSettingsError",void 0),ie(qn,Kn);var Xn=window.customCards=window.customCards||[];Xn.some(t=>"apollo-radar-calibrate-card"===t.type)||Xn.push({type:qn,name:"Apollo Radar Auto-Calibrate",description:"One-button empty-room calibration of every gate threshold on an Apollo MSR (LD2410) or R PRO (LD2412), with undo.",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"});var Yn=/(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$/,Qn=/(?:_ld2450)?_target_(\d+)_y(?:_\d+)?$/;function ti(t,e){return t?[{entity:t,name:e}]:[]}function ei(t,e){return e.filter(e=>function(t,e){return!!e&&e in t.states}(t,e.entity))}function ni(t){return void 0!==t&&"unavailable"!==t.state}function ii(t,e){return!!e&&ni(t.states[e])}function ri(t,e,n){const i=Ft(t,e),r=[];return i&&r.push(i.engineering_mode,i.radar_timeout,i.max_move_distance,i.max_still_distance,i.radar_target,i.moving_target,i.still_target,i.detection_distance,...i.move_threshold,...i.still_threshold,...i.move_energy,...i.still_energy),r.push(...function(t,e){const n=[];for(const[i]of mt(t.entities,e)){if(!i.startsWith("sensor."))continue;const t=i.slice(i.indexOf(".")+1);(Yn.test(t)||Qn.test(t))&&n.push(i)}return n}(t,e)),!!r.some(e=>ii(t,e))||!r.some(t=>void 0!==t)&&(n&&mt(t.entities,e).some(([e,n])=>"apollo_mmwave"!==n.platform&&ii(t,e)))}function si(t,e,n=!1){const i=t.devices[e];if(n&&!i)return;const r=function(t,e){let n=!1,i=!1;for(const[,r]of mt(t.entities,e))if(n=!0,void 0!==r.platform&&(i=!0,"esphome"===r.platform))return!0;return n&&!i}(t,e)?Et(i):void 0,s=Tt(t,e);if(!n&&!r&&!s)return;const o=ri(t,e,!!r);if(!n&&!r&&!o)return;const a=Ut(t,e)??(null==r?void 0:r.profile),l=function(t,e){for(const[n]of mt(t.entities,e))if(n.startsWith("sensor.")&&Yn.test(n.slice(n.indexOf(".")+1)))return!0;return!1}(t,e)||((null==r?void 0:r.ld2450)??!1);return n||a||l?{deviceId:e,base:s??e,name:(null==i?void 0:i.name_by_user)||(null==i?void 0:i.name)||s||e,profile:a,ld2450:l,online:o}:void 0}function oi(t,e){var n;if(e.device_id){const n=si(t,e.device_id,!0);return n?[n]:[]}return(null===(n=e.devices)||void 0===n?void 0:n.length)?e.devices.map(e=>si(t,e,!0)).filter(t=>void 0!==t):function(t){const e=[];for(const n of Object.keys(t.devices)){const i=si(t,n);i&&e.push(i)}return e}(t)}function ai(t,e){if(0!==e.length)return{type:"entities",title:t,show_header_toggle:!1,entities:e.map(t=>({entity:t.entity,name:t.name}))}}function li(t){const e=function(t){if(!t.profile&&!t.ld2450)return{type:"markdown",content:`**${t.name}**: no radar data available right now.\n\nThe device looks offline (or exposes no recognizable radar entities). Its cards will appear here once it reports in.`};if(!t.profile)return{type:"markdown",content:`**${t.name}**, Apollo mmWave (LD2450 tracking radar).\n\nDraw occupancy zones over the live target positions below.`};const e=t.profile;return{type:"markdown",content:`**${t.name}**, Apollo ${e.label} radar.\n\n**Start here**\n1. Press **Calibrate with empty room** on the Auto-calibrate card and leave the room.\n2. Set how far it should look: **${e.rangeLabels[0]} / ${e.rangeLabels[1]}** on the Detection Range card (each gate is 0.75 m unless you changed ${e.gateSizeLabel}).\n3. Set how long presence stays on after you stop moving: **Radar Timeout**, same card.\n4. Walk the room and watch the Gate Energy chart. Raise a gate's threshold if it triggers with nobody there, lower it if it misses you.\n\n[Full tuning guide →](${e.wikiUrl})`}}(t);return t.online||!t.profile&&!t.ld2450||(e.content=`${e.content}\n\n**Offline right now.** Its entities are unavailable, so the cards below will fill in once it reconnects. If this radar was replaced or reflashed under a new name, delete the old device in Home Assistant to drop this tab.`),e}function di(t){return{type:"markdown",content:t}}function ci(t,e,n,i){const r={help:li(e)};if(e.profile){const s=e.profile;r.calibrate={type:"custom:apollo-radar-calibrate-card",device_id:e.deviceId,device_base_name:e.base,title:"Auto-calibrate",...i?{calibration:i}:{}};const o=Ft(t,e.deviceId)??s.entityMap(e.base),a=s.label,l=ei(t,function(t){return[...ti(t.radar_target,"Detected"),...ti(t.zone_1_occupancy,"Zone 1"),...ti(t.zone_2_occupancy,"Zone 2"),...ti(t.zone_3_occupancy,"Zone 3")]}(o)),d=ai(`${a} Detection Range`,ei(t,function(t,e,n){return[...ti(t.radar_timeout,"Radar Timeout"),...ti(t.gate_size,n),...ti(t.max_move_distance,e[0]),...ti(t.max_still_distance,e[1])]}(o,s.rangeLabels,s.gateSizeLabel))),c=ai(`${a} Move Thresholds`,ei(t,function(t){const e=[];for(let n=0;n<t.move_threshold.length;n++)e.push(...ti(t.move_threshold[n],`G${n}`));return e}(o))),u=ai(`${a} Still Thresholds`,ei(t,function(t){const e=[];for(let n=0;n<t.still_threshold.length;n++)e.push(...ti(t.still_threshold[n],`G${n}`));return e}(o)));r.controls=ai(`${a} Controls`,ei(t,function(t){return[...ti(t.engineering_mode,"Radar Engineering Mode"),...ti(t.background_correction,"Start Dynamic Background Correction"),...ti(t.background_correction_status,"Background Correction Running"),...ti(t.bluetooth,"Bluetooth"),...ti(t.restart_radar,"Restart Radar"),...ti(t.factory_reset_radar,"Factory Reset Radar"),...ti(t.esp_reboot,"ESP Reboot")]}(o))),r.range=d,r.rangeNote=d?di(s.rangeTip):void 0,r.zone=ai(`${a} Zone Config`,ei(t,function(t){return[...ti(t.zone_1_start,"Start Zone 1"),...ti(t.end_zone_1,"End Zone 1"),...ti(t.end_zone_2,"End Zone 2"),...ti(t.end_zone_3,"End Zone 3")]}(o))),r.distance={type:"custom:apollo-radar-distance-card",device_id:e.deviceId,device_base_name:e.base,title:`${a} Distances`,...n?{distance_unit:n}:{}},r.gateEnergy={type:"custom:apollo-radar-gate-energy-card",device_id:e.deviceId,device_base_name:e.base,title:`${a} Gate Energy`},r.moveThr=c,r.stillThr=u,r.gateNote=c||u?di(s.gateTip):void 0,r.occupancy=ai(`${a} Target / Occupancy`,ei(t,function(t){return[...ti(t.radar_target,"Radar Target"),...ti(t.moving_target,"Radar Moving Target"),...ti(t.still_target,"Radar Still Target"),...ti(t.zone_1_occupancy,"Radar Zone 1 Occupancy"),...ti(t.zone_2_occupancy,"Radar Zone 2 Occupancy"),...ti(t.zone_3_occupancy,"Radar Zone 3 Occupancy")]}(o))),r.history=l.length?{type:"history-graph",title:`${a} Occupancy History`,hours_to_show:1,entities:l}:void 0}var s,o;return e.ld2450&&(r.zoneHeader=e.profile?{type:"heading",heading:"Zone Map"}:void 0,r.zoneMap=(s=e.deviceId,o=e.name,{type:"custom:apollo-radar-zone-map-card",device_id:s,title:o,unit_display:!0})),r}function ui(t,e,n,i){const r=ci(t,e,n,i),s=[];if(e.profile){const t=[r.calibrate,r.help,r.controls,r.zone],e=[r.distance,r.range,r.rangeNote];(r.zone?e:t).push(r.occupancy),s.push(t,e,[r.gateEnergy,r.moveThr,r.gateNote],[r.history,r.stillThr])}return e.profile||e.online&&r.zoneMap||s.push([r.help]),r.zoneMap&&s.push([r.zoneHeader,r.zoneMap]),s.map(t=>t.filter(Boolean)).filter(t=>t.length>0).map(t=>({type:"grid",cards:t}))}function hi(t,e){const n=/* @__PURE__ */new Set;return oi(t,e).map(i=>{let r=i.base;return n.has(r)&&(r=`${i.base}_${i.deviceId}`),n.add(r),function(t,e,n,i=e.base,r){return{title:e.name,path:i,type:"sections",sections:ui(t,e,n,r)}}(t,i,e.distance_unit,r,e.calibration)})}function _i(t,e){return oi(t,e).flatMap(n=>ui(t,n,e.distance_unit,e.calibration))}function pi(t,e){return oi(t,e).flatMap(n=>function(t,e,n,i){const r=ci(t,e,n,i);return[r.help,r.calibrate,r.controls,r.range,r.rangeNote,r.zone,r.distance,r.gateEnergy,r.moveThr,r.stillThr,r.gateNote,r.occupancy,r.history,r.zoneHeader,r.zoneMap].filter(Boolean)}(t,n,e.distance_unit,e.calibration))}function vi(t,e){return oi(t,e).map(t=>{var e;return JSON.stringify([t.deviceId,(null===(e=t.profile)||void 0===e?void 0:e.key)??"",t.ld2450,t.online,t.name,t.base])}).sort().join(",")}function fi(t,e,n){if(e.devices===n.devices&&e.entities===n.entities&&!function(t,e){for(const n in e.states){const i=e.states[n],r=t.states[n];if(r!==i&&ni(r)!==ni(i))return!0}return!1}(e,n))return!1;const i=function(t){const e=t.options;return 2===Object.keys(t).length&&"object"==typeof e&&null!==e}(t)?{...t,...t.options}:t;return vi(e,i)!==vi(n,i)}var gi={title:"Apollo Radar Tuning",cards:[{type:"markdown",content:"No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), R PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant."}]},mi={title:"Apollo Radar Tuning",cards:[{type:"markdown",content:"The dashboard's device selection points at devices that no longer exist in Home Assistant. Open Settings > Devices & Services > Apollo mmWave > Configure and clear or update Dashboard devices (leave it empty to show every Apollo mmWave device automatically)."}]},$i=class extends HTMLElement{static async generate(t,e){return{type:"sections",sections:_i(e,t)}}};$i.shouldRegenerate=fi;var yi=class extends HTMLElement{static async generate(t,e){var n;const i=hi(e,t),r=(null===(n=t.devices)||void 0===n?void 0:n.length)||t.device_id?mi:gi;return{title:"Apollo Radar Tuning",views:i.length?i:[r]}}};yi.shouldRegenerate=fi;var bi=class extends HTMLElement{static async generate(t,e){return{type:"grid",cards:pi(e,t)}}};bi.shouldRegenerate=fi,ie("ll-strategy-view-apollo-radar-tuning",$i),ie("ll-strategy-section-apollo-radar-tuning",bi),ie("ll-strategy-dashboard-apollo-radar-tuning",yi),window.customStrategies=window.customStrategies||[],window.customStrategies.some(t=>"apollo-radar-tuning"===t.type)||window.customStrategies.push({type:"apollo-radar-tuning",strategyType:"dashboard",name:"Apollo Radar Tuning",description:"Auto-built tuning dashboard for Apollo radar devices (MSR / LD2410, R PRO / LD2412 + LD2450, MTR-1 / LD2450).",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"});var wi="2.2.3";console.info(`%c APOLLO-MMWAVE %c v${wi} `,"color:#fff;background:#03a9f4;font-weight:700;","color:#03a9f4;background:#fff;font-weight:700;");export{wi as CARD_VERSION};