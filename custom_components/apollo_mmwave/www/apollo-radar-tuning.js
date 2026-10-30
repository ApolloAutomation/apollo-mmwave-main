/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var e,t=globalThis,n=t.ShadowRoot&&(void 0===t.ShadyCSS||t.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,i=Symbol(),s=/* @__PURE__ */new WeakMap,o=class{constructor(e,t,n){if(this._$cssResult$=!0,n!==i)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(n&&void 0===e){const n=void 0!==t&&1===t.length;n&&(e=s.get(t)),void 0===e&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),n&&s.set(t,e))}return e}toString(){return this.cssText}},r=(e,...t)=>{const n=1===e.length?e[0]:t.reduce((t,n,i)=>t+(e=>{if(!0===e._$cssResult$)return e.cssText;if("number"==typeof e)return e;throw Error("Value passed to 'css' function must be a 'css' function result: "+e+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+e[i+1],e[0]);return new o(n,e,i)},a=n?e=>e:e=>e instanceof CSSStyleSheet?(e=>{let t="";for(const n of e.cssRules)t+=n.cssText;return(e=>new o("string"==typeof e?e:e+"",void 0,i))(t)})(e):e,{is:l,defineProperty:d,getOwnPropertyDescriptor:c,getOwnPropertyNames:u,getOwnPropertySymbols:h,getPrototypeOf:_}=Object,p=globalThis,v=p.trustedTypes,f=v?v.emptyScript:"",g=p.reactiveElementPolyfillSupport,m=(e,t)=>e,y={toAttribute(e,t){switch(t){case Boolean:e=e?f:null;break;case Object:case Array:e=null==e?e:JSON.stringify(e)}return e},fromAttribute(e,t){let n=e;switch(t){case Boolean:n=null!==e;break;case Number:n=null===e?null:Number(e);break;case Object:case Array:try{n=JSON.parse(e)}catch(e){n=null}}return n}},$=(e,t)=>!l(e,t),b={attribute:!0,type:String,converter:y,reflect:!1,useDefault:!1,hasChanged:$};(e=Symbol).metadata??(e.metadata=Symbol("metadata")),p.litPropertyMetadata??(p.litPropertyMetadata=/* @__PURE__ */new WeakMap);var w=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=b){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const n=Symbol(),i=this.getPropertyDescriptor(e,n,t);void 0!==i&&d(this.prototype,e,i)}}static getPropertyDescriptor(e,t,n){const{get:i,set:s}=c(this.prototype,e)??{get(){return this[t]},set(e){this[t]=e}};return{get:i,set(t){const o=null==i?void 0:i.call(this);null==s||s.call(this,t),this.requestUpdate(e,o,n)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??b}static _$Ei(){if(this.hasOwnProperty(m("elementProperties")))return;const e=_(this);e.finalize(),void 0!==e.l&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(m("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(m("properties"))){const e=this.properties,t=[...u(e),...h(e)];for(const n of t)this.createProperty(n,e[n])}const e=this[Symbol.metadata];if(null!==e){const t=litPropertyMetadata.get(e);if(void 0!==t)for(const[e,n]of t)this.elementProperties.set(e,n)}this._$Eh=/* @__PURE__ */new Map;for(const[t,n]of this.elementProperties){const e=this._$Eu(t,n);void 0!==e&&this._$Eh.set(e,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const n=new Set(e.flat(1/0).reverse());for(const e of n)t.unshift(a(e))}else void 0!==e&&t.push(a(e));return t}static _$Eu(e,t){const n=t.attribute;return!1===n?void 0:"string"==typeof n?n:"string"==typeof e?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=/* @__PURE__ */new Map,this._$E_(),this.requestUpdate(),null===(e=this.constructor.l)||void 0===e||e.forEach(e=>e(this))}addController(e){var t;(this._$EO??(this._$EO=/* @__PURE__ */new Set)).add(e),void 0!==this.renderRoot&&this.isConnected&&(null===(t=e.hostConnected)||void 0===t||t.call(e))}removeController(e){var t;null===(t=this._$EO)||void 0===t||t.delete(e)}_$E_(){const e=/* @__PURE__ */new Map,t=this.constructor.elementProperties;for(const n of t.keys())this.hasOwnProperty(n)&&(e.set(n,this[n]),delete this[n]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((e,i)=>{if(n)e.adoptedStyleSheets=i.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(const n of i){const i=document.createElement("style"),s=t.litNonce;void 0!==s&&i.setAttribute("nonce",s),i.textContent=n.cssText,e.appendChild(i)}})(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),null===(e=this._$EO)||void 0===e||e.forEach(e=>{var t;return null===(t=e.hostConnected)||void 0===t?void 0:t.call(e)})}enableUpdating(e){}disconnectedCallback(){var e;null===(e=this._$EO)||void 0===e||e.forEach(e=>{var t;return null===(t=e.hostDisconnected)||void 0===t?void 0:t.call(e)})}attributeChangedCallback(e,t,n){this._$AK(e,n)}_$ET(e,t){const n=this.constructor.elementProperties.get(e),i=this.constructor._$Eu(e,n);if(void 0!==i&&!0===n.reflect){var s;const o=(void 0!==(null===(s=n.converter)||void 0===s?void 0:s.toAttribute)?n.converter:y).toAttribute(t,n.type);this._$Em=e,null==o?this.removeAttribute(i):this.setAttribute(i,o),this._$Em=null}}_$AK(e,t){const n=this.constructor,i=n._$Eh.get(e);if(void 0!==i&&this._$Em!==i){var s,o;const e=n.getPropertyOptions(i),r="function"==typeof e.converter?{fromAttribute:e.converter}:void 0!==(null===(s=e.converter)||void 0===s?void 0:s.fromAttribute)?e.converter:y;this._$Em=i;const a=r.fromAttribute(t,e.type);this[i]=a??(null===(o=this._$Ej)||void 0===o?void 0:o.get(i))??a,this._$Em=null}}requestUpdate(e,t,n,i=!1,s){if(void 0!==e){var o;const r=this.constructor;if(!1===i&&(s=this[e]),n??(n=r.getPropertyOptions(e)),!((n.hasChanged??$)(s,t)||n.useDefault&&n.reflect&&s===(null===(o=this._$Ej)||void 0===o?void 0:o.get(e))&&!this.hasAttribute(r._$Eu(e,n))))return;this.C(e,t,n)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(e,t,{useDefault:n,reflect:i,wrapped:s},o){n&&!(this._$Ej??(this._$Ej=/* @__PURE__ */new Map)).has(e)&&(this._$Ej.set(e,o??t??this[e]),!0!==s||void 0!==o)||(this._$AL.has(e)||(this.hasUpdated||n||(t=void 0),this._$AL.set(e,t)),!0===i&&this._$Em!==e&&(this._$Eq??(this._$Eq=/* @__PURE__ */new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}const e=this.scheduleUpdate();return null!=e&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[e,t]of this._$Ep)this[e]=t;this._$Ep=void 0}const e=this.constructor.elementProperties;if(e.size>0)for(const[t,n]of e){const{wrapped:e}=n,i=this[t];!0!==e||this._$AL.has(t)||void 0===i||this.C(t,void 0,n,i)}}let e=!1;const t=this._$AL;try{var n;e=this.shouldUpdate(t),e?(this.willUpdate(t),null===(n=this._$EO)||void 0===n||n.forEach(e=>{var t;return null===(t=e.hostUpdate)||void 0===t?void 0:t.call(e)}),this.update(t)):this._$EM()}catch(t){throw e=!1,this._$EM(),t}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;null===(t=this._$EO)||void 0===t||t.forEach(e=>{var t;return null===(t=e.hostUpdated)||void 0===t?void 0:t.call(e)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=/* @__PURE__ */new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(e=>this._$ET(e,this[e]))),this._$EM()}updated(e){}firstUpdated(e){}};w.elementStyles=[],w.shadowRootOptions={mode:"open"},w[m("elementProperties")]=/* @__PURE__ */new Map,w[m("finalized")]=/* @__PURE__ */new Map,null==g||g({ReactiveElement:w}),(p.reactiveElementVersions??(p.reactiveElementVersions=[])).push("2.1.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var x=globalThis,k=e=>e,S=x.trustedTypes,T=S?S.createPolicy("lit-html",{createHTML:e=>e}):void 0,z="$lit$",R=`lit$${Math.random().toFixed(9).slice(2)}$`,A="?"+R,E=`<${A}>`,C=document,M=()=>C.createComment(""),I=e=>null===e||"object"!=typeof e&&"function"!=typeof e,L=Array.isArray,D="[ \t\n\f\r]",P=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,O=/-->/g,F=/>/g,N=RegExp(`>|${D}(?:([^\\s"'>=/]+)(${D}*=${D}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),U=/'/g,j=/"/g,B=/^(?:script|style|textarea|title)$/i,H=e=>(t,...n)=>({_$litType$:e,strings:t,values:n}),Z=H(1),G=H(2),W=(H(3),Symbol.for("lit-noChange")),q=Symbol.for("lit-nothing"),J=/* @__PURE__ */new WeakMap,V=C.createTreeWalker(C,129);function K(e,t){if(!L(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==T?T.createHTML(t):t}var X=(e,t)=>{const n=e.length-1,i=[];let s,o=2===t?"<svg>":3===t?"<math>":"",r=P;for(let a=0;a<n;a++){const t=e[a];let n,l,d=-1,c=0;for(;c<t.length&&(r.lastIndex=c,l=r.exec(t),null!==l);)c=r.lastIndex,r===P?"!--"===l[1]?r=O:void 0!==l[1]?r=F:void 0!==l[2]?(B.test(l[2])&&(s=RegExp("</"+l[2],"g")),r=N):void 0!==l[3]&&(r=N):r===N?">"===l[0]?(r=s??P,d=-1):void 0===l[1]?d=-2:(d=r.lastIndex-l[2].length,n=l[1],r=void 0===l[3]?N:'"'===l[3]?j:U):r===j||r===U?r=N:r===O||r===F?r=P:(r=N,s=void 0);const u=r===N&&e[a+1].startsWith("/>")?" ":"";o+=r===P?t+E:d>=0?(i.push(n),t.slice(0,d)+z+t.slice(d)+R+u):t+R+(-2===d?a:u)}return[K(e,o+(e[n]||"<?>")+(2===t?"</svg>":3===t?"</math>":"")),i]},Y=class e{constructor({strings:t,_$litType$:n},i){let s;this.parts=[];let o=0,r=0;const a=t.length-1,l=this.parts,[d,c]=X(t,n);if(this.el=e.createElement(d,i),V.currentNode=this.el.content,2===n||3===n){const e=this.el.content.firstChild;e.replaceWith(...e.childNodes)}for(;null!==(s=V.nextNode())&&l.length<a;){if(1===s.nodeType){if(s.hasAttributes())for(const e of s.getAttributeNames())if(e.endsWith(z)){const t=c[r++],n=s.getAttribute(e).split(R),i=/([.?@])?(.*)/.exec(t);l.push({type:1,index:o,name:i[2],strings:n,ctor:"."===i[1]?ie:"?"===i[1]?se:"@"===i[1]?oe:ne}),s.removeAttribute(e)}else e.startsWith(R)&&(l.push({type:6,index:o}),s.removeAttribute(e));if(B.test(s.tagName)){const e=s.textContent.split(R),t=e.length-1;if(t>0){s.textContent=S?S.emptyScript:"";for(let n=0;n<t;n++)s.append(e[n],M()),V.nextNode(),l.push({type:2,index:++o});s.append(e[t],M())}}}else if(8===s.nodeType)if(s.data===A)l.push({type:2,index:o});else{let e=-1;for(;-1!==(e=s.data.indexOf(R,e+1));)l.push({type:7,index:o}),e+=R.length-1}o++}}static createElement(e,t){const n=C.createElement("template");return n.innerHTML=e,n}};function Q(e,t,n=e,i){var s,o;if(t===W)return t;let r=void 0!==i?null===(s=n._$Co)||void 0===s?void 0:s[i]:n._$Cl;const a=I(t)?void 0:t._$litDirective$;return(null==r?void 0:r.constructor)!==a&&(null==r||null===(o=r._$AO)||void 0===o||o.call(r,!1),void 0===a?r=void 0:(r=new a(e),r._$AT(e,n,i)),void 0!==i?(n._$Co??(n._$Co=[]))[i]=r:n._$Cl=r),void 0!==r&&(t=Q(e,r._$AS(e,t.values),r,i)),t}var ee=class{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:n}=this._$AD,i=((null==e?void 0:e.creationScope)??C).importNode(t,!0);V.currentNode=i;let s=V.nextNode(),o=0,r=0,a=n[0];for(;void 0!==a;){if(o===a.index){let t;2===a.type?t=new te(s,s.nextSibling,this,e):1===a.type?t=new a.ctor(s,a.name,a.strings,this,e):6===a.type&&(t=new re(s,this,e)),this._$AV.push(t),a=n[++r]}o!==(null==a?void 0:a.index)&&(s=V.nextNode(),o++)}return V.currentNode=C,i}p(e){let t=0;for(const n of this._$AV)void 0!==n&&(void 0!==n.strings?(n._$AI(e,n,t),t+=n.strings.length-2):n._$AI(e[t])),t++}},te=class e{get _$AU(){var e;return(null===(e=this._$AM)||void 0===e?void 0:e._$AU)??this._$Cv}constructor(e,t,n,i){this.type=2,this._$AH=q,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=n,this.options=i,this._$Cv=(null==i?void 0:i.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return void 0!==t&&11===(null==e?void 0:e.nodeType)&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=Q(this,e,t),I(e)?e===q||null==e||""===e?(this._$AH!==q&&this._$AR(),this._$AH=q):e!==this._$AH&&e!==W&&this._(e):void 0!==e._$litType$?this.$(e):void 0!==e.nodeType?this.T(e):(e=>L(e)||"function"==typeof(null==e?void 0:e[Symbol.iterator]))(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==q&&I(this._$AH)?this._$AA.nextSibling.data=e:this.T(C.createTextNode(e)),this._$AH=e}$(e){var t;const{values:n,_$litType$:i}=e,s="number"==typeof i?this._$AC(e):(void 0===i.el&&(i.el=Y.createElement(K(i.h,i.h[0]),this.options)),i);if((null===(t=this._$AH)||void 0===t?void 0:t._$AD)===s)this._$AH.p(n);else{const e=new ee(s,this),t=e.u(this.options);e.p(n),this.T(t),this._$AH=e}}_$AC(e){let t=J.get(e.strings);return void 0===t&&J.set(e.strings,t=new Y(e)),t}k(t){L(this._$AH)||(this._$AH=[],this._$AR());const n=this._$AH;let i,s=0;for(const o of t)s===n.length?n.push(i=new e(this.O(M()),this.O(M()),this,this.options)):i=n[s],i._$AI(o),s++;s<n.length&&(this._$AR(i&&i._$AB.nextSibling,s),n.length=s)}_$AR(e=this._$AA.nextSibling,t){var n;for(null===(n=this._$AP)||void 0===n||n.call(this,!1,!0,t);e!==this._$AB;){const t=k(e).nextSibling;k(e).remove(),e=t}}setConnected(e){var t;void 0===this._$AM&&(this._$Cv=e,null===(t=this._$AP)||void 0===t||t.call(this,e))}},ne=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,n,i,s){this.type=1,this._$AH=q,this._$AN=void 0,this.element=e,this.name=t,this._$AM=i,this.options=s,n.length>2||""!==n[0]||""!==n[1]?(this._$AH=Array(n.length-1).fill(/* @__PURE__ */new String),this.strings=n):this._$AH=q}_$AI(e,t=this,n,i){const s=this.strings;let o=!1;if(void 0===s)e=Q(this,e,t,0),o=!I(e)||e!==this._$AH&&e!==W,o&&(this._$AH=e);else{const i=e;let r,a;for(e=s[0],r=0;r<s.length-1;r++)a=Q(this,i[n+r],t,r),a===W&&(a=this._$AH[r]),o||(o=!I(a)||a!==this._$AH[r]),a===q?e=q:e!==q&&(e+=(a??"")+s[r+1]),this._$AH[r]=a}o&&!i&&this.j(e)}j(e){e===q?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}},ie=class extends ne{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===q?void 0:e}},se=class extends ne{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==q)}},oe=class extends ne{constructor(e,t,n,i,s){super(e,t,n,i,s),this.type=5}_$AI(e,t=this){if((e=Q(this,e,t,0)??q)===W)return;const n=this._$AH,i=e===q&&n!==q||e.capture!==n.capture||e.once!==n.once||e.passive!==n.passive,s=e!==q&&(n===q||i);i&&this.element.removeEventListener(this.name,this,n),s&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;"function"==typeof this._$AH?this._$AH.call((null===(t=this.options)||void 0===t?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}},re=class{constructor(e,t,n){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=n}get _$AU(){return this._$AM._$AU}_$AI(e){Q(this,e)}},ae=x.litHtmlPolyfillSupport;null==ae||ae(Y,te),(x.litHtmlVersions??(x.litHtmlVersions=[])).push("3.3.3");var le,de=globalThis,ce=class extends w{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e;const t=super.createRenderRoot();return(e=this.renderOptions).renderBefore??(e.renderBefore=t.firstChild),t}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=((e,t,n)=>{const i=(null==n?void 0:n.renderBefore)??t;let s=i._$litPart$;if(void 0===s){const e=(null==n?void 0:n.renderBefore)??null;i._$litPart$=s=new te(t.insertBefore(M(),e),e,void 0,n??{})}return s._$AI(e),s})(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),null===(e=this._$Do)||void 0===e||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),null===(e=this._$Do)||void 0===e||e.setConnected(!1)}render(){return W}};ce._$litElement$=!0,ce.finalized=!0,null===(le=de.litElementHydrateSupport)||void 0===le||le.call(de,{LitElement:ce});var ue=de.litElementPolyfillSupport;null==ue||ue({LitElement:ce}),(de.litElementVersions??(de.litElementVersions=[])).push("4.2.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var he={attribute:!0,type:String,converter:y,reflect:!1,hasChanged:$},_e=(e=he,t,n)=>{const{kind:i,metadata:s}=n;let o=globalThis.litPropertyMetadata.get(s);if(void 0===o&&globalThis.litPropertyMetadata.set(s,o=/* @__PURE__ */new Map),"setter"===i&&((e=Object.create(e)).wrapped=!0),o.set(n.name,e),"accessor"===i){const{name:i}=n;return{set(n){const s=t.get.call(this);t.set.call(this,n),this.requestUpdate(i,s,e,!0,n)},init(t){return void 0!==t&&this.C(i,void 0,e,t),t}}}if("setter"===i){const{name:i}=n;return function(n){const s=this[i];t.call(this,n),this.requestUpdate(i,s,e,!0,n)}}throw Error("Unsupported decorator location: "+i)};function pe(e){return(t,n)=>"object"==typeof n?_e(e,t,n):((e,t,n)=>{const i=t.hasOwnProperty(n);return t.constructor.createProperty(n,e),i?Object.getOwnPropertyDescriptor(t,n):void 0})(e,t,n)}
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/function ve(e){return pe({...e,state:!0,attribute:!1})}var fe=[],ge=/* @__PURE__ */new WeakMap;function me(e,t){return function(e){let t=ge.get(e);if(!t){t=/* @__PURE__ */new Map;for(const[n,i]of Object.entries(e)){const e=t.get(i.device_id);e?e.push([n,i]):t.set(i.device_id,[[n,i]])}ge.set(e,t)}return t}(e).get(t)??fe}function ye(e){return`${e}: the configured detection-range limit, shown as a gate number.`}var $e="💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values. The sliders start locked, so a scroll cannot move them. Press **Unlock** above them to change one. Or press **Calibrate with empty room** on the Auto-calibrate card to set them from your empty room.";function be(e){return`**Radar Timeout** is how long ${e} stays on after the radar last detects someone; raise it if lights turn off while you sit still.`}function we(e){return`Each gate is ${e} deep.`}var xe={move:[50,50,40,30,20,15,15,15,15],still:[0,0,40,40,30,30,20,20,20]},ke={key:"ld2410",label:"LD2410",maxBarLabels:["Max Move","Max Still"],rangeLabels:["Max Move Gate","Max Still Gate"],gateSizeLabel:"Gate Size",rangeTip:e=>`💡 **Max Move / Still Gate** cap the farthest gate used to detect moving vs. still targets; lower them to ignore distant motion. ${we(e)} `+be("**Radar Target**"),gateTip:$e,wikiUrl:"https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/",entityMap(e){const t=[0,1,2,3,4,5,6,7,8],n=e=>t.map(t=>e(t));return{engineering_mode:`switch.${e}_radar_engineering_mode`,bluetooth:`switch.${e}_ld2410_bluetooth`,restart_radar:`button.${e}_restart_radar`,factory_reset_radar:`button.${e}_factory_reset_radar`,esp_reboot:`button.${e}_esp_reboot`,query_params:`button.${e}_query_params`,radar_timeout:`number.${e}_radar_timeout`,zone_1_start:`number.${e}_radar_zone_1_start`,end_zone_1:`number.${e}_radar_end_zone_1`,end_zone_2:`number.${e}_radar_end_zone_2`,end_zone_3:`number.${e}_radar_end_zone_3`,max_move_distance:`number.${e}_radar_max_move_distance`,max_still_distance:`number.${e}_radar_max_still_distance`,gate_size:`select.${e}_ld2410_gate_size`,move_threshold:n(t=>`number.${e}_g${t}_move_threshold`),still_threshold:n(t=>`number.${e}_g${t}_still_threshold`),move_energy:n(t=>`sensor.${e}_g${t}_move_energy`),still_energy:n(t=>`sensor.${e}_g${t}_still_energy`),still_distance:`sensor.${e}_radar_still_distance`,moving_distance:`sensor.${e}_radar_moving_distance`,detection_distance:`sensor.${e}_radar_detection_distance`,radar_target:`binary_sensor.${e}_radar_target`,moving_target:`binary_sensor.${e}_radar_moving_target`,still_target:`binary_sensor.${e}_radar_still_target`,zone_1_occupancy:`binary_sensor.${e}_radar_zone_1_occupancy`,zone_2_occupancy:`binary_sensor.${e}_radar_zone_2_occupancy`,zone_3_occupancy:`binary_sensor.${e}_radar_zone_3_occupancy`,zone_occupancy:`binary_sensor.${e}_radar_zone_occupancy`}}},Se={key:"ld2412",label:"LD2412",maxBarLabels:["Max Gate","Min Gate"],maxBarTips:[ye("Max Gate"),"Min Gate: gates below this one are ignored for detection."],rangeLabels:["Max Gate","Min Gate"],gateSizeLabel:"Distance Resolution",rangeTip:e=>`💡 **Max Gate** is the farthest gate the radar uses and **Min Gate** the nearest; raise Min Gate to ignore anything right next to the sensor. ${we(e)} `+be("**LD2412 Presence** (Radar Target)"),gateTip:$e,wikiUrl:"https://wiki.apolloautomation.com/products/rpro1/setup/apollo-mmwave-dashboard/#r-pro-1-and-its-ld2412-radar",entityMap(e){const t=Array.from({length:14},(e,t)=>t),n=e=>t.map(t=>e((e=>String(e).padStart(2,"0"))(t)));return{engineering_mode:`switch.${e}_ld2412_engineering_mode`,bluetooth:`switch.${e}_ld2412_bluetooth`,restart_radar:`button.${e}_ld2412_restart`,factory_reset_radar:`button.${e}_ld2412_factory_reset`,esp_reboot:`button.${e}_esp_reboot`,radar_timeout:`number.${e}_ld2412_timeout`,zone_1_start:void 0,end_zone_1:void 0,end_zone_2:void 0,end_zone_3:void 0,zone_1_occupancy:void 0,zone_2_occupancy:void 0,zone_3_occupancy:void 0,zone_occupancy:void 0,max_move_distance:`number.${e}_ld2412_max_distance_gate`,max_still_distance:`number.${e}_ld2412_min_distance_gate`,gate_size:`select.${e}_ld2412_distance_resolution`,move_threshold:n(t=>`number.${e}_ld2412_g${t}_move_threshold`),still_threshold:n(t=>`number.${e}_ld2412_g${t}_still_threshold`),move_energy:n(t=>`sensor.${e}_ld2412_g${t}_move_energy`),still_energy:n(t=>`sensor.${e}_ld2412_g${t}_still_energy`),still_distance:void 0,moving_distance:void 0,detection_distance:void 0,radar_target:`binary_sensor.${e}_ld2412_presence`,moving_target:`binary_sensor.${e}_ld2412_moving_target`,still_target:`binary_sensor.${e}_ld2412_still_target`,background_correction:`button.${e}_ld2412_start_dynamic_background_correction`,background_correction_status:`binary_sensor.${e}_ld2412_dynamic_background_correction_status`,query_params:`button.${e}_ld2412_query_params`}}},Te=[Se,ke],ze=[{prefix:"msr-1",profile:ke,ld2450:!1},{prefix:"msr-2",profile:ke,ld2450:!1},{prefix:"mtr-1",ld2450:!0},{prefix:"r-pro-1",profile:Se,ld2450:!0}];function Re(e){if(!(null==e?void 0:e.manufacturer)||!e.model)return;if("apolloautomation"!==e.manufacturer.toLowerCase())return;const t=e.model.toLowerCase(),n=ze.find(e=>t.startsWith(e.prefix));return n?{profile:n.profile,ld2450:n.ld2450}:void 0}function Ae(e,t){for(const n of Te){const i=n.entityMap(t).engineering_mode;if(i&&i in e.states)return n}}var Ee=[/_ld2412_(?!.*ld2412_).+$/,/_ld2450_(?!.*ld2450_).+$/,/_target_\d+_[xy](?:_\d+)?$/,/_radar_engineering_mode(?:_\d+)?$/,/_ld2410_bluetooth(?:_\d+)?$/,/_radar_control_bluetooth(?:_\d+)?$/,/_radar_distance_resolution(?:_\d+)?$/,/_restart_radar(?:_\d+)?$/,/_factory_reset_radar(?:_\d+)?$/,/_esp_reboot(?:_\d+)?$/,/_radar_timeout(?:_\d+)?$/,/_radar_zone_\d+_start(?:_\d+)?$/,/_radar_end_zone_\d+(?:_\d+)?$/,/_radar_max_move_distance(?:_\d+)?$/,/_radar_max_still_distance(?:_\d+)?$/,/_ld2410_gate_size(?:_\d+)?$/,/_g\d+_move_threshold(?:_\d+)?$/,/_g\d+_still_threshold(?:_\d+)?$/,/_g\d+_move_energy(?:_\d+)?$/,/_g\d+_still_energy(?:_\d+)?$/,/_radar_still_distance(?:_\d+)?$/,/_radar_moving_distance(?:_\d+)?$/,/_radar_detection_distance(?:_\d+)?$/,/_radar_moving_target(?:_\d+)?$/,/_radar_still_target(?:_\d+)?$/,/_radar_target(?:_\d+)?$/,/_radar_zone_\d+_occupancy(?:_\d+)?$/];function Ce(e){for(const t of Ee)if(t.test(e))return e.replace(t,"")}function Me(e,t){const n=me(e.entities,t).map(([e])=>e.slice(e.indexOf(".")+1)),i=/* @__PURE__ */new Map;for(const r of n){const e=Ce(r);e&&i.set(e,(i.get(e)??0)+1)}let s,o=0;for(const[r,a]of i)a>o&&(s=r,o=a);return s}var Ie=["move_threshold","still_threshold","move_energy","still_energy"],Le="(?:_\\d+)?$",De=(e,t,n)=>({slot:e,domain:t,re:new RegExp(n+Le)}),Pe=[De("engineering_mode","switch","_radar_engineering_mode"),De("bluetooth","switch","_ld2410_bluetooth"),De("bluetooth","switch","_radar_control_bluetooth"),De("gate_size","select","_radar_distance_resolution"),De("restart_radar","button","_restart_radar"),De("factory_reset_radar","button","_factory_reset_radar"),De("esp_reboot","button","_esp_reboot"),De("query_params","button","_query_params"),De("radar_timeout","number","_radar_timeout"),De("zone_1_start","number","_radar_zone_1_start"),De("end_zone_1","number","_radar_end_zone_1"),De("end_zone_2","number","_radar_end_zone_2"),De("end_zone_3","number","_radar_end_zone_3"),De("max_move_distance","number","_radar_max_move_distance"),De("max_still_distance","number","_radar_max_still_distance"),De("gate_size","select","_ld2410_gate_size"),De("still_distance","sensor","_radar_still_distance"),De("moving_distance","sensor","_radar_moving_distance"),De("detection_distance","sensor","_radar_detection_distance"),De("moving_target","binary_sensor","_radar_moving_target"),De("still_target","binary_sensor","_radar_still_target"),De("radar_target","binary_sensor","_radar_target"),De("zone_1_occupancy","binary_sensor","_radar_zone_1_occupancy"),De("zone_2_occupancy","binary_sensor","_radar_zone_2_occupancy"),De("zone_3_occupancy","binary_sensor","_radar_zone_3_occupancy"),De("zone_occupancy","binary_sensor","_radar_zone_occupancy"),De("engineering_mode","switch","_ld2412_engineering_mode"),De("bluetooth","switch","_ld2412_bluetooth"),De("restart_radar","button","_ld2412_restart"),De("factory_reset_radar","button","_ld2412_factory_reset"),De("radar_timeout","number","_ld2412_timeout"),De("max_move_distance","number","_ld2412_max_distance_gate"),De("max_still_distance","number","_ld2412_min_distance_gate"),De("gate_size","select","_ld2412_distance_resolution"),De("radar_target","binary_sensor","_ld2412_presence"),De("moving_target","binary_sensor","_ld2412_moving_target"),De("still_target","binary_sensor","_ld2412_still_target"),De("background_correction","button","_ld2412_start_dynamic_background_correction"),De("background_correction_status","binary_sensor","_ld2412_dynamic_background_correction_status"),De("query_params","button","_ld2412_query_params")],Oe=[["move_threshold","number"],["still_threshold","number"],["move_energy","sensor"],["still_energy","sensor"]].map(([e,t])=>({slot:e,domain:t,re:new RegExp(`_g(\\d+)_${e}${Le}`)}));function Fe(e,t){for(const n of Oe){const i=n.re.exec(t);if(i)return e===n.domain?{slot:n.slot,gate:parseInt(i[1],10)}:void 0}for(const n of Pe)if(n.re.test(t))return e===n.domain?{slot:n.slot}:void 0}var Ne=[/_ld2410_/,new RegExp(`_radar_engineering_mode${Le}`),new RegExp(`_g\\d+_(?:move|still)_(?:threshold|energy)${Le}`),new RegExp(`_radar_max_(?:move|still)_distance${Le}`)];function Ue(e,t){let n=!1;for(const[i]of me(e.entities,t)){const e=i.slice(i.indexOf(".")+1);if(/_ld2412_/.test(e))return Se;n||(n=Ne.some(t=>t.test(e)))}return n?ke:void 0}function je(e,t){const n={move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]};let i=!1;for(const[s]of me(e.entities,t)){const e=s.indexOf("."),t=Fe(s.slice(0,e),s.slice(e+1));if(t)if("gate"in t){const e=n[t.slot];void 0===e[t.gate]&&(e[t.gate]=s,i=!0)}else void 0===n[t.slot]&&(n[t.slot]=s,i=!0)}return i?n:void 0}function Be(e,t){let n;return t.device_id&&(n=Me(e,t.device_id)),!n&&t.device_base_name&&(n=t.device_base_name),n}function He(e,t){if(t.device_id){const n=Ue(e,t.device_id);if(n)return n;const i=Re(e.devices[t.device_id]);if(i)return i.profile}const n=Be(e,t);if(n)return Ae(e,n)??ke}function Ze(e,t){let n,i;if(t.device_id&&(n=je(e,t.device_id)),!n){i=Be(e,t);const s=i?He(e,t)??ke:void 0;n=i&&s?s.entityMap(i):{move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]}}const s=t.entities?function(e,t){const n={...e,...t};for(const i of Ie)Array.isArray(n[i])||(n[i]=e[i]);return n}(n,t.entities):n;return i?{map:s,fallbackBase:i}:{map:s}}function Ge(e,t){return!!t&&t in e.states}var We=[{slot:"apollo_firmware",domain:"sensor",re:new RegExp(`_apollo_firmware_version${Le}`)},{slot:"ld2410_firmware",domain:"sensor",re:new RegExp(`_radar_firmware_version${Le}`)},{slot:"ld2412_firmware",domain:"sensor",re:new RegExp(`_ld2412_firmware${Le}`)},{slot:"ld2450_firmware",domain:"sensor",re:new RegExp(`_ld2450_firmware${Le}`)},{slot:"update",domain:"update",re:new RegExp(`_firmware_update${Le}`)},{slot:"rssi",domain:"sensor",re:new RegExp(`_rssi${Le}`)},{slot:"esp_reboot",domain:"button",re:new RegExp(`_esp_reboot${Le}`)}];function qe(e,t){if("string"==typeof t)e.push(t);else if(Array.isArray(t))for(const n of t)n&&e.push(n)}function Je(e){const t=[];for(const n of Object.values(e))qe(t,n);return t}function Ve(e,t){const n=[];for(const i of t)qe(n,e[i]);return n}function Ke(e,t,n){return(null==e?void 0:e.resolved)===t?e:{resolved:t,ids:Ve(t.map,n)}}function Xe(e){return Je(e).filter(t=>t!==e.esp_reboot)}function Ye(e,t,n){if(e&&e.config===n&&e.entities===t.entities&&e.devices===t.devices&&(void 0===e.fallbackBase||Ae(t,e.fallbackBase)===e.fallbackDetected))return e;const{map:i,fallbackBase:s}=Ze(t,n);return{config:n,entities:t.entities,devices:t.devices,map:i,profile:He(t,n),ids:Je(i),radarIds:Xe(i),fallbackBase:s,fallbackDetected:void 0===s?void 0:Ae(t,s)}}function Qe(e,t,n){return n.some(n=>e.states[n]!==t.states[n])}function et(e,t,n,i,s){if(i!==n)return Qe(e,t,i.ids);const{radarIds:o}=i;return tt(e,o)!==tt(t,o)||Qe(e,t,s)}function tt(e,t){return t.some(t=>t in e.states)}var nt=/* @__PURE__ */new Map,it=!1;function st(e,t){try{window.customElements.get(e)||window.customElements.define(e,t)}catch{}}function ot(){for(const[e,t]of nt)st(e,t)}function rt(e,t){if(nt.set(e,t),st(e,t),!it){it=!0;for(const e of["home-assistant","hc-main"])window.customElements.whenDefined(e).then(ot,()=>{})}}function at(e,t,n){const i=window.customCards=window.customCards||[];i.some(t=>t.type===e)||i.push({type:e,name:t,description:n,documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"})}var lt=["mm","cm","m","in","ft","yd"],dt={mm:.001,cm:.01,m:1,in:.0254,ft:.3048,yd:.9144};function ct(e){return!!e&&lt.includes(e)}function ut(e,t,n){return t===n?e:function(e,t){return e*dt[t]}(e,t)/dt[n]}function ht(e,t){if(!t)return;const n=e.states[t];if(!n)return;const i=parseFloat(n.state);return Number.isFinite(i)?i:void 0}function _t(e,t,n){var i;const s=t?null===(i=e.states[t])||void 0===i||null===(i=i.attributes)||void 0===i?void 0:i.unit_of_measurement:void 0;return ct(s)?s:n}function pt(e){if(!e)return;const t=e.replace(",",".").match(/[0-9]*\.?[0-9]+/);if(!t)return;const n=parseFloat(t[0]);return Number.isFinite(n)?n:void 0}function vt(e,t,n){return t<=0?0:function(e,t,n){return Math.max(t,Math.min(n,e))}(e/t*n,0,n)}function ft(e){return Math.max(e.move_threshold.length,e.still_threshold.length,e.move_energy.length,e.still_energy.length)}var gt="#2e7d32",mt="#6a1b9a",yt=["#d32f2f","#1565c0","#2e7d32"];function $t(e,t){return`hsl(${220-220*e/Math.max(1,t-1)}, 64%, 48%)`}var bt="var(--secondary-text-color, #9aa0a6)";function wt(e,t,n){const i=ht(e,t);if(void 0!==i)return ut(i,_t(e,t,n),n)}var xt=["gate_size","detection_distance","moving_distance","still_distance","radar_target","moving_target","still_target","zone_1_start","end_zone_1","end_zone_2","end_zone_3","zone_1_occupancy","zone_2_occupancy","zone_3_occupancy","max_move_distance","max_still_distance"];var kt=64,St=22,Tt=15;function zt(e,t,n,i=ke.maxBarLabels,s="LD2410",o){if(0===t.move_threshold.length)return q;const r=function(e,t,n){var i;const s=ut(pt(t.gate_size?null===(i=e.states[t.gate_size])||void 0===i?void 0:i.state:void 0)??.75,"m",n),o=ft(t),r=o>1?o-1:8,a=s*r,l=[],d=(t,i,s,o)=>{var r;if(!t||!(t in e.states))return;const a=!!i&&"off"===(null===(r=e.states[i])||void 0===r?void 0:r.state);l.push({label:s,value:a?0:wt(e,t,n)??0,color:o,noTarget:a})};d(t.detection_distance,t.radar_target,"Detection","#b71c1c"),d(t.moving_distance,t.moving_target,"Moving",mt),d(t.still_distance,t.still_target,"Still",gt);const c=[],u=[wt(e,t.zone_1_start,n),wt(e,t.end_zone_1,n),wt(e,t.end_zone_2,n),wt(e,t.end_zone_3,n)],h=[t.zone_1_occupancy,t.zone_2_occupancy,t.zone_3_occupancy];for(let f=0;f<3;f++){var _;const t=u[f],n=u[f+1];if(void 0===t||void 0===n)continue;const i=h[f];c.push({label:`Zone ${f+1}`,start:t,end:n,color:yt[f],occupied:!!i&&"on"===(null===(_=e.states[i])||void 0===_?void 0:_.state)})}const p=ht(e,t.max_still_distance),v=ht(e,t.max_move_distance);return{unit:n,gateSizeChart:s,gateCount:r,maxRange:a,bars:l,zones:c,maxStill:void 0===p?void 0:p*s,maxMove:void 0===v?void 0:v*s,maxStillGate:p,maxMoveGate:v}}(e,t,n),a=e=>kt+vt(e,r.maxRange,402),l=[];r.zones.length&&l.push({kind:"zones"});for(const p of r.bars)l.push({kind:"bar",bar:p});l.push({kind:"gates"}),void 0!==r.maxMove&&void 0!==r.maxMoveGate&&l.push({kind:"max",label:i[0],value:r.maxMove,gate:r.maxMoveGate,tip:null==o?void 0:o[0],color:mt}),void 0!==r.maxStill&&void 0!==r.maxStillGate&&l.push({kind:"max",label:i[1],value:r.maxStill,gate:r.maxStillGate,tip:null==o?void 0:o[1],color:gt});const d=6+30*l.length,c=d+52,u=e=>r.gateSizeChart>=10?e.toFixed(0):String(Number(e.toFixed(2))),h=[];for(let p=0;p<=r.gateCount;p++){const e=a(r.gateSizeChart*p),t=r.gateSizeChart*p;h.push(G`
      <line x1=${e} y1=${6} x2=${e} y2=${d}
        stroke="var(--divider-color, #555)" stroke-width="1" opacity="0.3"></line>
      <text x=${e} y=${d+13} font-size="11" text-anchor="end"
        transform="rotate(-45 ${e} ${d+13})" fill=${bt}>${u(t)} ${n}</text>`)}const _=l.map((e,t)=>{const i=6+30*t,s=G`<text x=${58} y=${i+Tt} font-size="12"
      text-anchor="end" fill=${bt}>${function(e){return"zones"===e.kind?"Zones":"gates"===e.kind?"Gates":"bar"===e.kind?e.bar.label:e.label}(e)}</text>`;let o;if("zones"===e.kind)o=r.zones.map((e,t)=>{const n=a(e.start),s=a(e.end),o=s-n,r=o>=40;return G`
          <rect x=${n} y=${i} width=${Math.max(1,o)} height=${St}
            rx="4" fill=${e.color} opacity=${e.occupied?.95:.6}></rect>
          ${r?G`<text x=${n+6} y=${i+Tt} font-size="13" font-weight="600"
                fill="#fff">Z${t+1}</text>`:q}
          <circle cx=${s-11} cy=${i+11} r="5"
            fill=${e.occupied?"#fff":"none"} stroke="#fff" stroke-width="2"></circle>`});else if("bar"===e.kind){const t=a(e.bar.value),s=e.bar.noTarget?"no target":(e=>`${e.toFixed(1)} ${n}`)(e.bar.value);o=G`
        <rect x=${kt} y=${i} width=${Math.max(1,t-kt)} height=${St}
          rx="4" fill=${e.bar.color}></rect>
        ${function(e,t,n){return e>296.36?G`<text x=${e-6} y=${n+Tt} font-size="13" text-anchor="end" fill="#fff">${t}</text>`:G`<text x=${e+6} y=${n+Tt} font-size="13" fill=${"var(--primary-text-color, #e6e6e6)"}>${t}</text>`}(t,s,i)}`}else if("gates"===e.kind){const e=[];for(let t=0;t<r.gateCount;t++){const n=a(r.gateSizeChart*t),s=a(r.gateSizeChart*(t+1));e.push(G`
          <rect x=${n} y=${i} width=${Math.max(1,s-n)} height=${St}
            fill=${$t(t,r.gateCount)}></rect>
          <text x=${(n+s)/2} y=${i+Tt} font-size="12" font-weight="600"
            text-anchor="middle" fill="#fff">G${t+1}</text>`)}o=e}else{const t=a(e.value),n=`G${e.gate}`;o=G`
        <rect x=${kt} y=${i} width=${Math.max(1,t-kt)} height=${St}
          rx="4" fill=${e.color} opacity="0.6"></rect>
        <text x=${(kt+t)/2} y=${i+Tt} font-size="13" font-weight="600"
          text-anchor="middle" fill="#fff">${n}</text>`}const l="bar"===e.kind&&e.bar.noTarget?G`<g opacity=${.45}>${s}${o}</g>`:G`${s}${o}`;return G`<g>
      <title>${function(e){if("zones"===e.kind)return"Detection zones. The circle shows whether a target is currently in each zone (filled = present).";if("gates"===e.kind)return"The radar splits its range into gates. Each colored segment is one distance bin (G1, G2, ...).";if("max"===e.kind)return e.tip??ye(e.label);const t="Detection"===(n=e.bar.label)?"Current distance to the detected target.":"Moving"===n?"Current distance to a moving target.":"Current distance to a still (stationary) target.";var n;return e.bar.noTarget?`${t} The radar reports no target right now.`:t}(e)}</title>
      <rect x="0" y=${i} width=${478} height=${St} fill="transparent"></rect>
      ${l}
    </g>`});return Z`
    <svg viewBox="0 0 ${478} ${c}" width="100%" role="img"
      aria-label="${s} distances">
      ${h} ${_}
    </svg>
  `}function Rt(e,t,n,i){var s,o=arguments.length,r=o<3?t:null===i?i=Object.getOwnPropertyDescriptor(t,n):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,n,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(r=(o<3?s(r):o>3?s(t,n,r):s(t,n))||r);return o>3&&r&&Object.defineProperty(t,n,r),r}var At=class extends ce{setConfig(e){this._config=e}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-distance-card"}}shouldUpdate(e){if(!e.has("hass")||e.has("_config"))return!0;const t=e.get("hass");if(!t||!this.hass||!this._config)return!0;if(t.entities!==this.hass.entities||t.devices!==this.hass.devices||t.config!==this.hass.config)return!0;const n=this._resolved;return this._resolved=Ye(n,this.hass,this._config),this._watched=Ke(this._watched,this._resolved,xt),et(t,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return q;this._resolved=Ye(this._resolved,this.hass,this._config);const{map:e,profile:t,radarIds:n}=this._resolved;if(!tt(this.hass,n))return this._renderNotFound();const i=ct(this._config.distance_unit)?this._config.distance_unit:"mi"===(null==(s=this.hass)||null===(o=s.config)||void 0===o||null===(o=o.unit_system)||void 0===o?void 0:o.length)?"in":"m";var s,o;const r=(null==t?void 0:t.label)??"LD2410",a=zt(this.hass,e,i,null==t?void 0:t.maxBarLabels,r,null==t?void 0:t.maxBarTips);return a===q?q:Z`
      <ha-card .header=${this._config.title??`${r} Distances`}>
        <div class="wrap">${a}</div>
      </ha-card>
    `}_renderNotFound(){var e,t;const n=(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.label)??"LD2410";return Z`
      <ha-card .header=${(null===(t=this._config)||void 0===t?void 0:t.title)??`${n} Distances`}>
        <div class="not-found">
          Apollo mmWave: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};At.styles=r`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
  `,Rt([pe({attribute:!1})],At.prototype,"hass",void 0),Rt([ve()],At.prototype,"_config",void 0),rt("apollo-radar-distance-card",At),at("apollo-radar-distance-card","Apollo Radar Distance Chart","Distance / zone chart for Apollo MSR (LD2410) & R PRO (LD2412).");var Et="apollo_mmwave",Ct=`${Et}/calibration/subscribe`,Mt=[1e3,2e3,5e3,1e4,2e4],It="Apollo mmWave is not loaded, so calibration is unavailable.",Lt=/^Validation error:\s*/;async function Dt(e,t,n){return e.connection.subscribeMessage(n,{type:Ct,device_id:t})}async function Pt(e,t){try{return await e.connection.subscribeMessage(e=>{(Array.isArray(e)?e:[e]).some(e=>{var t,n;return("updated"===(null==e?void 0:e.type)||"added"===(null==e?void 0:e.type))&&"apollo_mmwave"===(null==e||null===(t=e.entry)||void 0===t?void 0:t.domain)&&"loaded"===(null==e||null===(n=e.entry)||void 0===n?void 0:n.state)})&&t()},{type:"config_entries/subscribe"})}catch{return null}}function Ot(e,t,n,i,s=!1){return e.callService(t,n,i,void 0,s)}function Ft(e){const t={};for(const[n,i]of Object.entries(e))void 0!==i&&(t[n]=i);return t}function Nt(e){if(e&&"object"==typeof e&&void 0===e.code){const t=e.error;if(t&&"object"==typeof t)return t}return e}function Ut(e){const t=Nt(e);if("apollo_mmwave"===(null==t?void 0:t.translation_domain))return"string"==typeof t.translation_key?t.translation_key:void 0}function jt(e){const t=e.trim();return/[.!?]$/.test(t)?t:`${t}.`}function Bt(e,t={}){const n=Nt(e),i=null==n?void 0:n.code;if("not_found"===i){var s;if("service"!==t.source)return"Home Assistant has no device with this id. The radar was probably removed and re-added; reload the dashboard, or set device_id in the card YAML.";const e=null==n||null===(s=n.translation_placeholders)||void 0===s?void 0:s.domain;if(void 0===e||"apollo_mmwave"===e)return It}if("not_loaded"===i)return It;const o=function(e,t){const n=null==e?void 0:e.translation_domain,i=null==e?void 0:e.translation_key;if(!t||!n||!i)return null;let s;try{s=t(`component.${n}.exceptions.${i}.message`,e.translation_placeholders??void 0)}catch{return null}return!s||s.startsWith("Translation error")?null:jt(s)}(n,t.localize);if(o)return o;const r="string"==typeof n?n:null==n?void 0:n.message;if(r){const e=String(r).replace(Lt,"");if(e.trim())return jt(e)}return"Home Assistant rejected the request."}async function Ht(e,t){var n;const i=null===(n=Nt(t))||void 0===n?void 0:n.translation_domain;if(i&&"function"==typeof e.loadBackendTranslation)try{const t=await e.loadBackendTranslation("exceptions",i);if("function"==typeof t)return t}catch{}return"function"==typeof e.localize?e.localize.bind(e):void 0}async function Zt(e,t){return Bt(t,{source:"service",localize:await Ht(e,t)})}var Gt="#4b0082",Wt="#9467bd",qt="#274e13",Jt="#8cb640",Vt="var(--secondary-text-color, #9aa0a6)",Kt=r`
  .chart-legend {
    font-size: 0.8em;
    color: var(--secondary-text-color);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 6px;
  }
`,Xt=["engineering_mode","move_threshold","still_threshold","move_energy","still_energy"];function Yt(e){return 10+186*(1-Math.max(0,Math.min(100,e))/100)}function Qt(e,t,n="LD2410"){var i;const s=function(e,t){var n,i;let s=!1;const o=t=>{t&&t in e.states&&(s=!0)},r=ft(t),a=Array.from({length:r},(n,i)=>(o(t.move_energy[i]),o(t.still_energy[i]),o(t.move_threshold[i]),o(t.still_threshold[i]),{index:i,move:ht(e,t.move_energy[i])??0,still:ht(e,t.still_energy[i])??0,moveThr:ht(e,t.move_threshold[i]),stillThr:ht(e,t.still_threshold[i])}));return{engineeringMode:!!t.engineering_mode&&"on"===(null===(n=e.states[t.engineering_mode])||void 0===n?void 0:n.state),unavailable:!!t.engineering_mode&&"unavailable"===(null===(i=e.states[t.engineering_mode])||void 0===i?void 0:i.state),present:s,gates:a}}(e,t);if(!s.present)return q;const o=444/s.gates.length,r=.32*o,a=Yt(0),l=s.gates.map(e=>{const t=26+o*e.index+o/2,n=t-r-2,i=t+2,l=[],d=s.engineeringMode&&void 0!==e.moveThr&&e.move>e.moveThr,c=s.engineeringMode&&void 0!==e.stillThr&&e.still>e.stillThr;if(l.push(G`
      <rect x=${n} y=${Yt(e.move)} width=${r} height=${a-Yt(e.move)}
        fill=${Gt}
        stroke="${d?Wt:q}"
        stroke-width="${d?"2":q}"></rect>
      <rect x=${i} y=${Yt(e.still)} width=${r} height=${a-Yt(e.still)}
        fill=${qt}
        stroke="${c?Jt:q}"
        stroke-width="${c?"2":q}"></rect>
      <text x=${t} y=${213} font-size="13" text-anchor="middle"
        fill=${Vt}>G${e.index}</text>`),s.engineeringMode&&void 0!==e.moveThr){const t=Yt(e.moveThr),i=n+r/2;l.push(G`<path d="M ${i-5} ${t-5} L ${i-5} ${t+5} L ${i+5} ${t} Z"
        fill=${Wt}></path>`)}if(s.engineeringMode&&void 0!==e.stillThr){const t=Yt(e.stillThr),n=i+r/2;l.push(G`<path d="M ${n+5} ${t-5} L ${n+5} ${t+5} L ${n-5} ${t} Z"
        fill=${Jt}></path>`)}return l}),d=[0,25,50,75,100].map(e=>G`
      <line x1=${26} y1=${Yt(e)} x2=${470} y2=${Yt(e)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${22} y=${Yt(e)+3} font-size="11" text-anchor="end"
        fill=${Vt}>${e}</text>`),[c,u]=s.unavailable?["Radar unavailable","Waiting for the device to reconnect"]:["Turn on Radar Engineering Mode","to see gate energy values"],h=s.engineeringMode?q:G`
        <rect x=${26} y=${10} width=${444} height=${186}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${248} y=${103} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${248} dy="-4">${c}</tspan>
          <tspan x=${248} dy="28">${u}</tspan>
        </text>`,_=t.engineering_mode,p=_?null===(i=e.states[_])||void 0===i?void 0:i.state:void 0,v=!s.engineeringMode&&!!_&&!!e.callService&&void 0!==p&&"unavailable"!==p?Z`<button
        type="button"
        class="overlay"
        tabindex="0"
        style="position:absolute;left:${248/470*100}%;top:${72.18181818181819}%;transform:translate(-50%,-50%)"
        @click=${()=>Ot(e,"switch","turn_on",{entity_id:_},!0).catch(()=>{})}
      >
        Turn on Radar Engineering Mode
      </button>`:q,f=Z`
    <svg viewBox="0 0 ${470} ${220}" width="100%" role="img"
      aria-label="${n} gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A gate
        detects a target when its energy rises above the threshold. Turn on
        Radar Engineering Mode to see live energy.
      </title>
      ${d} ${l} ${h}
    </svg>
  `;return Z`
    <div class="chart-plot" style="position:relative">
      ${f} ${v}
    </div>
    <div class="chart-legend">
      <span><span style="color:${Gt}">■</span> Move energy</span>
      <span><span style="color:${qt}">■</span> Still energy</span>
      <span><span style="color:${Wt}">▶</span> Move threshold</span>
      <span><span style="color:${Jt}">◀</span> Still threshold</span>
      <span>outlined bar = above threshold (detecting)</span>
    </div>
  `}var en=class extends ce{setConfig(e){this._config=e}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-gate-energy-card"}}shouldUpdate(e){if(!e.has("hass")||e.has("_config"))return!0;const t=e.get("hass");if(!t||!this.hass||!this._config)return!0;if(t.entities!==this.hass.entities||t.devices!==this.hass.devices)return!0;const n=this._resolved;return this._resolved=Ye(n,this.hass,this._config),this._watched=Ke(this._watched,this._resolved,Xt),et(t,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return q;this._resolved=Ye(this._resolved,this.hass,this._config);const{map:e,profile:t,radarIds:n}=this._resolved;if(!tt(this.hass,n))return this._renderNotFound();const i=(null==t?void 0:t.label)??"LD2410",s=Qt(this.hass,e,i);return s===q?q:Z`
      <ha-card .header=${this._config.title??`${i} Gate Energy`}>
        <div class="wrap">${s}</div>
      </ha-card>
    `}_renderNotFound(){var e,t;const n=(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.label)??"LD2410";return Z`
      <ha-card .header=${(null===(t=this._config)||void 0===t?void 0:t.title)??`${n} Gate Energy`}>
        <div class="not-found">
          Apollo mmWave: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};en.styles=[Kt,r`
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
    `],Rt([pe({attribute:!1})],en.prototype,"hass",void 0),Rt([ve()],en.prototype,"_config",void 0),rt("apollo-radar-gate-energy-card",en),at("apollo-radar-gate-energy-card","Apollo Radar Gate Energy Chart","Per-gate move/still energy chart for Apollo MSR (LD2410) & R PRO (LD2412).");var tn=.5,nn=["move","still"],sn="Read settings from the radar",on="Reading settings from the radar...",rn=/* @__PURE__ */new Set(["done","cancelled","failed"]);function an(e){return void 0!==e&&rn.has(e)}function ln(e){if(!e)return null;const t=new Date(e);return Number.isNaN(t.getTime())?null:t}function dn(e,t){return e.toDateString()===t.toDateString()}var cn={hour:"2-digit",minute:"2-digit"},un={day:"numeric",month:"short"};function hn(e,t=/* @__PURE__ */new Date){const n=ln(e);if(!n)return e;const i=dn(n,t)?cn:{...un,...cn};return new Intl.DateTimeFormat(void 0,i).format(n)}function _n(e){const t=ln(e);return t?new Intl.DateTimeFormat(void 0,{...un,...cn}).format(t):e}function pn(e){if(e>=60&&e%60==0){const t=e/60;return`${t} ${1===t?"minute":"minutes"}`}return`${e} ${1===e?"second":"seconds"}`}function vn(e,t){return`${e} ${1===e?t:`${t}s`}`}function fn(e){return Object.keys(e).sort((e,t)=>Number(e)-Number(t))}function gn(e){const t=[];for(const i of["move","still"]){var n;const s=(null===(n=e.peaks)||void 0===n?void 0:n[i])??{},o=fn(s);if(0===o.length)continue;const r=o.map(e=>`G${e} ${s[e]}`).join(" · ");t.push(`Highest so far, ${i}: ${r}`)}return t}var mn="Reading the radar's current thresholds...",yn="Checking that the radar accepted the new values...",$n="Restoring saved thresholds...",bn="Finishing...";function wn(e){if("restore"===e.kind)switch(e.status){case"applying":return"refresh"===e.sub_phase?{phase:mn,detail:""}:{phase:$n,detail:`${e.writes_done} of ${e.writes_total}`};case"verifying":return{phase:yn,detail:""};case"preparing":return{phase:$n,detail:""};default:return{phase:bn,detail:""}}switch(e.status){case"preparing":return"settle"===e.sub_phase?{phase:"Leave the room now.",detail:""}:"warmup"===e.sub_phase?{phase:"Waiting for gate energy from the radar...",detail:""}:{phase:"Turning on Radar Engineering Mode...",detail:""};case"sampling":return{phase:"Listening to the empty room...",detail:`${e.remaining_s??e.duration_s} s left`};case"applying":return"refresh"===e.sub_phase?{phase:mn,detail:""}:{phase:`Writing ${e.writes_total} thresholds to the radar...`,detail:`${e.writes_done} of ${e.writes_total}`};case"verifying":return{phase:yn,detail:""};default:return{phase:bn,detail:""}}}function xn(e){return Number.isFinite(e)?Math.max(0,Math.min(1,e)):0}function kn(e){return null==e?"":String(Math.round(10*e)/10)}function Sn(e){return null===e.peak||void 0===e.peak?"":e.flags.includes("spike")?`${kn(e.peak)} (spike seen)`:kn(e.peak)}function Tn(e,t){var n;const i=t?null==e||null===(n=e.states)||void 0===n||null===(n=n[t])||void 0===n||null===(n=n.attributes)||void 0===n?void 0:n.max:void 0,s="number"==typeof i?i:"string"==typeof i?parseFloat(i):NaN;return Number.isFinite(s)?s:100}var zn=()=>100;function Rn(e,t){return!e.skipped&&!e.flags.includes("unused")&&(null!==e.old&&void 0!==e.old&&null!==e.new&&void 0!==e.new&&(Math.abs(e.old-t)<=tn&&e.new<t-tn))}function An(e,t,n){if("not selected"===e.skipped)return null===e.old?"(not selected)":`${kn(e.old)} (not selected)`;if(e.skipped)return`skipped: ${e.skipped}`;if(null===e.new||void 0===e.new)return"no data";if(e.written&&!1===e.confirmed&&null===e.actual)return"not confirmed (radar offline)";const i=e.flags.includes("off");if(!(null===e.old||Math.abs(e.new-e.old)>tn))return i?`${kn(e.new)} (off)`:`${kn(e.old)} (unchanged)`;const s=`${kn(e.old)} → ${kn(e.new)}`,o=[];return i&&o.push("off"),Rn(e,n)&&o.push("was off"),!t&&e.written&&!1===e.confirmed&&o.push("not confirmed"),o.length?`${s} (${o.join(", ")})`:s}function En(e,t,n){return{peak:Sn(e),text:An(e,t,n(e.entity_id)),flags:[...e.flags]}}function Cn(e){const t=[e.move,e.still].filter(e=>"not selected"!==e.skipped);return t.length>0&&t.every(e=>e.flags.includes("unused"))}function Mn(e){return e.map(e=>`G${e}`).join(", ")}function In(e,t){return`G${e} ${t} threshold`}function Ln(e){const t=e.unverified??[];if(0===t.length)return null;const n=t.map(t=>{const n=function(e,t){for(const n of e.gates??[]){if(n.move.entity_id===t)return In(n.gate,"move");if(n.still.entity_id===t)return In(n.gate,"still")}return t}(e,t.entity_id);return null===t.actual||void 0===t.actual?`${n} could not be read (radar offline)`:`${n} reads back ${kn(t.actual)} (asked for ${kn(t.asked)})`});return`${vn(t.length,"value")} could not be confirmed: ${n.join(", ")}. Check the Move / Still Thresholds cards.`}function Dn(e){const t=[],n=e.warnings??[];for(const i of n)if("presence"===i){const n=Math.round(100*(e.presence_fraction??0));t.push(`The radar reported someone present for ${n}% of the listen. If someone was in the room, even sitting still, press Undo and run it again.`)}else if("radar_unavailable"===i)t.push("The radar was unavailable for part of the listen; gates with too few readings were left as they were.");else if("unverified"===i){const n=Ln(e);n&&t.push(n)}else if("gate_off"===i)for(const n of e.gates_off??[])t.push(`The ${In(n.gate,n.channel)} is now off (its background peaked at ${kn(n.peak)}). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty.`);if(!n.includes("unverified")&&"restore"===e.kind){const n=Ln(e);n&&t.push(n)}return t}function Pn(e){return"move"===e?"Move Thresholds":"Still Thresholds"}function On(e,t=zn){const n="preview"===e.outcome;if("calibrate"!==e.kind)return[];if(!n&&"applied"!==e.outcome&&"partial"!==e.outcome)return[];const i=[];for(const s of e.gates??[])for(const e of nn){const o=s[e],r=t(o.entity_id);if(!Rn(o,r))continue;if(!(n||o.written&&!1!==o.confirmed))continue;const a=In(s.gate,e),l=kn(r),d=Pn(e);i.push(n?`The ${a} is off (set to ${l}) and calibration would turn it back on (would set ${kn(o.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card after you calibrate.`:`The ${a} was off (set to ${l}) and calibration turned it back on (now ${kn(o.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card, or press Undo to put back all your previous values.`)}return i}function Fn(e,t){var n;if(!t)return null;const i=parseFloat((null===(n=e.states[t])||void 0===n?void 0:n.state)??"");return Number.isFinite(i)?Math.trunc(i):null}function Nn(e,t,n,i){if("ld2412"===e)return!(null!==t.min_gate&&n<t.min_gate)&&(null===t.max_gate||n<=t.max_gate);const s="move"===i?t.max_move_gate:t.max_still_gate;return null===s||n<=s}function Un(e,t,n,i){var s;if(!e||"calibrate"!==e.kind)return!1;if("applied"!==e.outcome&&"partial"!==e.outcome)return!1;if((e.gates_off??[]).some(e=>e.gate===t&&e.channel===n))return!0;const o=null===(s=e.gates)||void 0===s||null===(s=s.find(e=>e.gate===t))||void 0===s?void 0:s[n];return!(!(null==o?void 0:o.written)||null===o.new||void 0===o.new)&&Math.abs(o.new-i)<=tn}function jn(e,t){let n=0;for(let i=t;i<e.length;i++){if("calibrate"===e[i].reason)return n%2==0?"previous":"calibrated";n+=1}return null}function Bn(e,t=/* @__PURE__ */new Date){const n=e[0];if(!n)return"Nothing to restore yet";switch(jn(e,0)){case"previous":return"Undo (restore your previous values)";case"calibrated":return"Redo (put the calibrated values back)";default:return`Restore the values saved at ${hn(n.taken_at,t)}`}}function Hn(e,t=/* @__PURE__ */new Date){const n=e[0];if(!n)return;const i=ln(n.taken_at),s=hn(n.taken_at,t);return i&&dn(i,t)?`Saved at ${s}`:`Saved ${s}`}function Zn(e,t="changed"){const n=e.changed??0;return`${n} of ${n+(e.unchanged??0)} thresholds ${t}`}function Gn(e){const t=e.writes_done??0;return 0===t?"Stopped. Nothing was changed.":`Stopped after ${t} of ${e.writes_total??t} values were written. Undo restores the saved values.`}function Wn(e,t=/* @__PURE__ */new Date){if("failed"===e.status||"failed"===e.outcome)return Vn(e);if("cancelled"===e.outcome)return Gn(e);const n=hn(e.finished_at,t);if("restore"===e.kind){const t=e.restored??0,i=e.unchanged??0;return`Restored ${vn(t,"value")} at ${n}, ${i} unchanged.`}const i=vn(e.samples??0,"sample");return"preview"===e.outcome?`Previewed at ${n} from ${i}. ${Zn(e,"would change")}.`:`Calibrated at ${n} from ${i}. ${Zn(e)}.`}function qn(e){const t=e.writes_done??0;return 0===t?". Nothing was changed.":` after ${t} of ${e.writes_total??t} values were written.`}var Jn=/nothing was changed/i;function Vn(e){var t;const n=(null===(t=e.error)||void 0===t?void 0:t.message)??"Unknown error.",i="restore"===e.kind?"Restore failed: ":"Calibration failed: ";return 0!==(e.writes_done??0)||Jn.test(n)?`${i}${n}`:`${i}${n} Nothing was changed.`}function Kn(e,t){const n=e.restored_from;if((null==n?void 0:n.id)||(null==n?void 0:n.taken_at))return n;if(e.snapshot_id){const n=t.findIndex(t=>t.id===e.snapshot_id),i=n>=0?t[n+1]:void 0;return i?{id:i.id,taken_at:i.taken_at}:null}const i=t[0];return i?{id:i.id,taken_at:i.taken_at}:null}function Xn(e,t,n=/* @__PURE__ */new Date){const i=Kn(e,t),s=(null==i?void 0:i.id)?function(e,t,n){const i=t.findIndex(e=>e.id===n);if(i<0)return null;let s=0;if(e.snapshot_id){const n=t.findIndex(t=>t.id===e.snapshot_id);if(n<0)return null;s=n+1}return i===s?jn(t,i):null}(e,t,i.id):null;if("previous"===s)return"Restored your previous values.";if("calibrated"===s)return"Restored the calibrated values.";const o=null==i?void 0:i.taken_at;return o?`Restored the thresholds from ${hn(o,n)}.`:"Restored the saved thresholds."}function Yn(e){const t=e.missing??[];return t.length?`Not found any more: ${t.join(", ")}.`:null}var Qn={observedFinish:null,lastJobId:null,lastJobTerminal:!1};var ei="apollo-radar-calibrate-card",ti="Calibrate with empty room";function ni(e){const t=/^(.+?) (\([^()]*\))$/.exec(e);return t?Z`<span class="value">${t[1]}</span> <span class="note">${t[2]}</span>`:Z`<span class="value">${e}</span>`}function ii(e){try{const t=e();t&&"function"==typeof t.catch&&t.catch(()=>{})}catch{}}var si=class extends ce{constructor(...e){super(...e),this._local=Qn,this._loadState="loading",this._loadError="",this._showLastResult=!1,this._readingSettings=!1,this._unsubscribe=null,this._serial=0,this._pending=!1,this._retryTimer=null,this._retryIndex=0,this._onReady=()=>this._reopen(),this._onDisconnected=()=>this._cancelRetry(),this._entryFeed=null,this._entryFeedSerial=0,this._lastJobApply=null,this._readSettingsToken=0,this._maxOf=e=>Tn(this.hass,e)}setConfig(e){this._config=e}getCardSize(){return 6}static getStubConfig(){return{type:`custom:${ei}`}}connectedCallback(){super.connectedCallback(),this._attachConnectionListeners(),this._open()}disconnectedCallback(){super.disconnectedCallback(),this._cancelReadSettings(),this._detachConnectionListeners(),this._closeEntryFeed(),this._close()}shouldUpdate(e){if(1!==e.size||!e.has("hass"))return!0;const t=e.get("hass");return!(t&&this.hass&&this._config)||(t.entities!==this.hass.entities||t.devices!==this.hass.devices||t.connection!==this.hass.connection||(this._resolved=Ye(this._resolved,this.hass,this._config),Qe(t,this.hass,this._watchedIds())))}willUpdate(e){if(!this.hass||!this._config)return;if(!e.has("hass")&&!e.has("_config"))return;this._resolved=Ye(this._resolved,this.hass,this._config);const t=function(e,t,n){if(t.device_id)return t.device_id;for(const s of Je(n)){var i;const t=null===(i=e.entities[s])||void 0===i?void 0:i.device_id;if(t)return t}}(this.hass,this._config,this._resolved.map);this._attachConnectionListeners(),t!==this._deviceId&&(this._deviceId=t,this._payload=void 0,this._local=Qn,this._failure=void 0,this._stopError=void 0,this._turnOffError=void 0,this._lastJobApply=null,this._showLastResult=!1,this._cancelReadSettings(),this._retryIndex=0,this._loadState="loading",this._close()),this._open()}_watchedIds(){var e,t;const n=null===(e=this._resolved)||void 0===e?void 0:e.map;if(!n)return[];const i=null===(t=this._payload)||void 0===t?void 0:t.entities;return[n.engineering_mode,...n.move_threshold,...n.still_threshold,n.max_move_distance,n.max_still_distance,n.radar_target,n.background_correction_status,null==i?void 0:i.engineering_mode,null==i?void 0:i.background_status].filter(e=>!!e)}_apiHass(){var e;const t=this.hass;if((null==t?void 0:t.callService)&&(null===(e=t.connection)||void 0===e?void 0:e.subscribeMessage))return t}_open(){if(this._openEntryFeed(),!this.isConnected||this._unsubscribe||this._pending||this._retryTimer)return;const e=this._apiHass(),t=this._deviceId;if(!e||!t)return;const n=++this._serial;this._pending=!0,Dt(e,t,e=>{n===this._serial&&this._applyPayload(e)}).then(e=>{n===this._serial?(this._pending=!1,this._unsubscribe=e,this._retryIndex=0,"idle"!==this._loadState&&(this._loadState=this._payload?"idle":"loading")):ii(e)},e=>{n===this._serial&&(this._pending=!1,this._failOpen(e))})}_failOpen(e){const t=null==e?void 0:e.code;if("not_loaded"===t&&this._retryIndex<Mt.length){const e=Mt[this._retryIndex];return this._retryIndex+=1,this._loadState="retrying",void(this._retryTimer=setTimeout(()=>{this._retryTimer=null,this._open()},e))}this._loadState="not_loaded"===t?"not_loaded":"error",this._loadError=Bt(e)}_close(){this._serial+=1,this._pending=!1,this._cancelRetry();const e=this._unsubscribe;this._unsubscribe=null,e&&ii(e)}_cancelRetry(){null!==this._retryTimer&&(clearTimeout(this._retryTimer),this._retryTimer=null)}_reopen(){this._retryIndex=0,this._close(),this._open()}_openEntryFeed(){const e=this._apiHass(),t=null==e?void 0:e.connection;if(!(this.isConnected&&e&&t&&this._deviceId))return;if(this._entryFeedConnection===t)return;this._closeEntryFeed(),this._entryFeedConnection=t;const n=++this._entryFeedSerial;Pt(e,()=>{n===this._entryFeedSerial&&this._reopen()}).then(e=>{n===this._entryFeedSerial?this._entryFeed=e:e&&ii(e)})}_closeEntryFeed(){this._entryFeedSerial+=1,this._entryFeedConnection=void 0;const e=this._entryFeed;this._entryFeed=null,e&&ii(e)}_retryNow(){this._retryIndex=0,this._loadState="loading",this._close(),this._open()}_attachConnectionListeners(){var e;const t=null===(e=this.hass)||void 0===e?void 0:e.connection;this.isConnected&&t&&t!==this._listenedConnection&&(this._detachConnectionListeners(),t.addEventListener&&(t.addEventListener("ready",this._onReady),t.addEventListener("disconnected",this._onDisconnected),this._listenedConnection=t))}_detachConnectionListeners(){const e=this._listenedConnection;this._listenedConnection=void 0,(null==e?void 0:e.removeEventListener)&&(e.removeEventListener("ready",this._onReady),e.removeEventListener("disconnected",this._onDisconnected))}_applyPayload(e){var t;const n=null===(t=this._payload)||void 0===t||null===(t=t.job)||void 0===t?void 0:t.job_id;this._local=function(e,t){var n;const i=t.job;if(i){const t=an(i.status);return{observedFinish:t?i.job_id:e.observedFinish,lastJobId:i.job_id,lastJobTerminal:t}}let s=e.observedFinish;return null===e.lastJobId||e.lastJobTerminal||(null===(n=t.last_result)||void 0===n?void 0:n.job_id)!==e.lastJobId||(s=e.lastJobId),{observedFinish:s,lastJobId:null,lastJobTerminal:!1}}(this._local,e),this._payload=e,this._loadState="idle";const i=e.job;i&&(this._lastJobApply={jobId:i.job_id,apply:i.apply}),i&&!an(i.status)&&(this._failure=void 0),i&&!an(i.status)&&i.job_id===n||(this._stopError=void 0)}_start(e){var t;const n=this._apiHass(),i=this._deviceId;if(!n||!i)return;this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,this._local={...this._local,observedFinish:null};const s={...(null===(t=this._config)||void 0===t?void 0:t.calibration)??{}};e||(s.apply=!1),function(e,t,n={}){return Ot(e,Et,"calibrate_gates",{device_id:t,...Ft(n)})}(n,i,s).catch(t=>this._showServiceFailure("Calibration failed: ",t,()=>this._start(e)))}async _showServiceFailure(e,t,n){const i=this._deviceId,s=await Zt(this.hass??{},t);i===this._deviceId&&(this._failure={prefix:e,message:s,retry:n,code:Ut(t)})}_stop(){const e=this._apiHass(),t=this._deviceId;e&&t&&(this._stopError=void 0,function(e,t){return Ot(e,Et,"cancel_calibration",{device_id:t})}(e,t).catch(async e=>{const n=await Zt(this.hass??{},e);t===this._deviceId&&(this._stopError=`Could not stop the calibration: ${n}`)}))}_undo(e){const t=this._apiHass(),n=this._deviceId;t&&n&&(this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,function(e,t,n){return Ot(e,Et,"restore_gate_thresholds",{device_id:t,...n?{snapshot_id:n}:{}})}(t,n,e).catch(t=>this._showServiceFailure("Restore failed: ",t,()=>this._undo(e))))}_turnOff(){const e=this._apiHass(),t=this._engineeringSwitchId();if(!e||!t)return;const n=this._deviceId;this._turnOffError=void 0,function(e,t,n){return Ot(e,"switch",n?"turn_on":"turn_off",{entity_id:t})}(e,t,!1).catch(async e=>{const t=await Zt(this.hass??{},e);n===this._deviceId&&(this._turnOffError=`Could not turn Radar Engineering Mode off: ${t}`)})}_readSettingsThenRetry(e,t){const n=this._apiHass(),i=this._deviceId;if(!n||!i||this._readingSettings)return;const s=++this._readSettingsToken,o=()=>s===this._readSettingsToken&&i===this._deviceId;this._readingSettings=!0,this._readSettingsError=void 0,function(e,t){return Ot(e,"button","press",{entity_id:t})}(n,e).then(()=>{setTimeout(()=>{var e;if(!o())return;this._readingSettings=!1;const n=null===(e=this._payload)||void 0===e?void 0:e.job;n&&!an(n.status)||t()},3e3)},async e=>{const t=await Zt(this.hass??{},e);o()&&(this._readingSettings=!1,this._readSettingsError=`Could not ask the radar for its settings: ${t}`)})}_cancelReadSettings(){this._readSettingsToken+=1,this._readingSettings=!1,this._readSettingsError=void 0}_closeResult(){this._cancelReadSettings(),this._failure=void 0,this._local={...this._local,observedFinish:null}}_profileKey(){var e,t;return(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.key)??(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.profile)}_engineeringSwitchId(){var e,t;return(null===(e=this._resolved)||void 0===e?void 0:e.map.engineering_mode)??(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.engineering_mode)??void 0}_engineeringOn(){var e,t;const n=this._engineeringSwitchId(),i=n&&this.hass?null===(e=this.hass.states[n])||void 0===e?void 0:e.state:void 0;return void 0!==i?"on"===i:!!(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.engineering_mode_on)}_backgroundOn(){var e,t,n,i;const s=(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.background_status)??(null===(t=this._resolved)||void 0===t?void 0:t.map.background_correction_status),o=s&&this.hass?null===(n=this.hass.states[s])||void 0===n?void 0:n.state:void 0;return void 0!==o?"on"===o:!!(null===(i=this._payload)||void 0===i||null===(i=i.entities)||void 0===i?void 0:i.background_status_on)}_queryParamsButtonId(){var e,t,n;const i=(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.query_params_button)??(null===(t=this._resolved)||void 0===t?void 0:t.map.query_params);return i&&(null===(n=this.hass)||void 0===n?void 0:n.states[i])?i:void 0}_warningLines(e){return[...Dn(e),...On(e,this._maxOf)]}_online(){var e;if(!this.hass||!this._resolved)return!1;if(!tt(this.hass,this._resolved.ids))return!1;const t=this._engineeringSwitchId(),n=t?null===(e=this.hass.states[t])||void 0===e?void 0:e.state:void 0;return void 0!==n&&"unavailable"!==n}render(){return this.hass&&this._config?(this._resolved=Ye(this._resolved,this.hass,this._config),Z`
      <ha-card .header=${this._config.title??"Auto-calibrate"}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `):q}_renderSubtitle(){var e,t;const n=this._deviceId;if(!n||!this.hass)return q;const i=(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.label)??(null===(t=this._profileKey())||void 0===t?void 0:t.toUpperCase()),s=this.hass.devices[n],o=(null==s?void 0:s.name_by_user)||(null==s?void 0:s.name);return i||o?Z`<div class="subtitle">${[i,o].filter(Boolean).join(" · ")}</div>`:q}_renderBody(){var e;if(!this._deviceId)return Z`<p class="hint">${"Add device_id to this card's configuration to enable auto-calibration."}</p>`;if("retrying"===this._loadState)return Z`<div class="status" aria-live="polite"><p>${"Apollo mmWave is still loading..."}</p></div>`;if("not_loaded"===this._loadState||"error"===this._loadState){const e="not_loaded"===this._loadState?"Apollo mmWave is not loaded, so calibration is unavailable.":this._loadError;return Z`
        <div class="section">
          <div class="status" aria-live="polite"><p class="error">${e}</p></div>
          <div class="buttons">
            <button type="button" class="secondary" @click=${this._retryNow}>Retry</button>
          </div>
        </div>
      `}const t=this._payload;if(!t)return Z`<div class="status" aria-live="polite"><p class="hint">Loading...</p></div>`;const n=t.job;return n&&!an(n.status)?this._renderRunning(n):this._failure?this._renderFailure(this._failure,t):n&&(null===(e=t.last_result)||void 0===e?void 0:e.job_id)!==n.job_id?this._renderFinishing():function(e,t){var n;return null!==e.observedFinish&&!(t.job&&!an(t.job.status))&&(null===(n=t.last_result)||void 0===n?void 0:n.job_id)===e.observedFinish}(this._local,t)&&t.last_result?this._renderResult(t.last_result,t):this._renderIdle(t)}_renderRunning(e){const t=function(e,t){const n=function(e){return"ld2412"===e?"Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes.":"Leave Radar Engineering Mode on until this finishes."}(t),{phase:i,detail:s}=wn(e),o=s?`${i} ${s}`:i;if("restore"===e.kind)return[o];switch(e.status){case"preparing":return"engineering"===e.sub_phase?[o]:"settle"===e.sub_phase?[o,`Listening starts in ${e.remaining_s??e.settle_s} s.`,n]:[o,n];case"sampling":return[o,`Keep the room empty. ${vn(e.samples,"sample")} so far.`,...gn(e),n];case"applying":return"refresh"===e.sub_phase?[o]:[o,"Values already written stay until you undo."];default:return[o]}}(e,this._profileKey()),{phase:n,detail:i}=wn(e),s="calibrate"===e.kind&&("preparing"===e.status||"sampling"===e.status||"applying"===e.status);return Z`
      <div class="section">
        <div class="status">
          <p class="headline"><span class="phase" aria-live="polite">${n}</span>${i?` ${i}`:""}</p>
          ${t.slice(1).map(e=>Z`<p>${e}</p>`)}
        </div>
        ${this._renderBar(e)}
        ${s?Z`
              <div class="buttons">
                <button
                  type="button"
                  class="secondary"
                  ?disabled=${!function(e){return!(!e||"calibrate"!==e.kind||e.cancel_requested||"preparing"!==e.status&&"sampling"!==e.status&&"applying"!==e.status)}(e)}
                  @click=${this._stop}
                >
                  ${e.cancel_requested?"Stopping...":"Stop"}
                </button>
              </div>
            `:q}
        ${this._stopError?Z`<p class="error" role="alert">${this._stopError}</p>`:q}
      </div>
    `}_renderBar(e){const{fraction:t,label:n}=function(e){return"preparing"===e.status&&"settle"===e.sub_phase&&e.settle_s>0?{fraction:xn(e.elapsed_s/e.settle_s),label:`${e.remaining_s??e.settle_s} s`}:"sampling"===e.status&&e.duration_s>0?{fraction:xn(e.elapsed_s/e.duration_s),label:`${e.remaining_s??e.duration_s} s left`}:"applying"===e.status&&"refresh"!==e.sub_phase&&e.writes_total>0?{fraction:xn(e.writes_done/e.writes_total),label:`${e.writes_done} of ${e.writes_total}`}:{fraction:null,label:""}}(e),i=null===t?100:Math.round(100*t);return Z`
      <div
        class="bar ${null===t?"indeterminate":""}"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${null===t?q:i}
        aria-label=${n||q}
      >
        <div class="fill" style="width:${i}%"></div>
      </div>
    `}_renderFinishing(){return Z`
      <div class="section">
        <div class="status" aria-live="polite"><p class="headline">Finishing...</p></div>
        <div class="bar indeterminate" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="fill" style="width:100%"></div>
        </div>
      </div>
    `}_closeButton(){return Z`<button type="button" class="text" @click=${this._closeResult}>Close</button>`}_renderFailure(e,t){return Z`
      <div class="section">
        ${this._renderBanner(t)}
        <div class="status" aria-live="polite">
          <p class="error">${e.prefix}${e.message}</p>
          ${this._renderReadSettingsLines(e.code)}
        </div>
        <div class="buttons">
          ${this._renderRetryButton(e.code,e.retry)} ${this._closeButton()}
        </div>
      </div>
    `}_renderReadSettingsLines(e){if("thresholds_not_numeric"!==e)return q;const t=this._queryParamsButtonId()?"":"Open the radar's device page, press its Query Params button in the Diagnostic section, wait a few seconds, then try again.";return Z`<div class="read-settings">
      ${t?Z`<p>${t}</p>`:q}
      ${this._readingSettings?Z`<p>${on}</p>`:q}
      ${this._readSettingsError?Z`<p class="error" role="alert">${this._readSettingsError}</p>`:q}
    </div>`}_renderRetryButton(e,t){const n="thresholds_not_numeric"===e?this._queryParamsButtonId():void 0;return n?Z`<button
      type="button"
      class="primary"
      ?disabled=${this._readingSettings}
      @click=${()=>this._readSettingsThenRetry(n,t)}
    >
      ${sn}
    </button>`:Z`<button type="button" class="primary" @click=${t}>Try again</button>`}_renderResult(e,t){const n=t.snapshots??[],i=this._renderBanner(t),s=n.length?Z`<button
          type="button"
          class="secondary"
          title=${Hn(n)??q}
          @click=${()=>this._undo()}
        >
          ${Bn(n)}
        </button>`:q,o=e=>Z`<button type="button" class="primary" @click=${()=>this._start(!0)}>${e}</button>`;var r;if("failed"===e.status||"failed"===e.outcome)return Z`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="error">${Vn(e)}</p>
            ${this._renderReadSettingsLines(null===(r=e.error)||void 0===r?void 0:r.code)}
          </div>
          <div class="buttons">
            ${function(e){return(e.writes_done??0)>0&&!!e.snapshot_id}(e)?s:q} ${this._renderTryAgain(e,n)}
            ${this._closeButton()}
          </div>
        </div>
      `;if("cancelled"===e.outcome){const t=e.writes_done??0;return Z`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite"><p>${Gn(e)}</p></div>
          <div class="buttons">
            ${t>0?s:q} ${o(ti)} ${this._closeButton()}
          </div>
        </div>
      `}if("restore"===e.kind){const r=Yn(e);return Z`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="headline">${Xn(e,n)}</p>
            ${r?Z`<p>${r}</p>`:q}
            ${this._warningLines(e).map(e=>Z`<p class="warning">${e}</p>`)}
          </div>
          ${this._renderIdleBody(t)}
          <div class="buttons">${s} ${o(ti)}</div>
        </div>
      `}return"preview"===e.outcome?Z`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="headline">Preview: no threshold was changed.</p>
            <p>These are the thresholds calibration would set:</p>
          </div>
          ${this._renderTable(e)}
          ${this._warningLines(e).map(e=>Z`<p class="warning">${e}</p>`)}
          <div class="buttons">${o("Calibrate and apply")} ${this._closeButton()}</div>
        </div>
      `:Z`
      <div class="section">
        ${i}
        <div class="status" aria-live="polite">
          <p class="headline">${function(e){return"partial"===e.outcome?`Thresholds updated, ${(e.unverified??[]).length} could not be confirmed`:"Thresholds updated"}(e)}</p>
          <p>${Wn(e)}</p>
        </div>
        ${this._renderTable(e)}
        ${this._warningLines(e).map(e=>Z`<p class="warning">${e}</p>`)}
        <p>${"Now walk around, then sit still for a minute: the Radar Target row in Target / Occupancy should stay on the whole time you are in the room and turn off a few seconds after you leave (Radar Timeout)."}</p>
        <div class="buttons">${s} ${o("Calibrate again")} ${this._closeButton()}</div>
      </div>
    `}_renderTryAgain(e,t){var n;let i;if("restore"===e.kind){const n=Kn(e,t);if(!(null==n?void 0:n.id))return q;const s=n.id;i=()=>this._undo(s)}else{const t=this._lastJobApply,n=!t||t.jobId!==e.job_id||t.apply;i=()=>this._start(n)}return this._renderRetryButton(null===(n=e.error)||void 0===n?void 0:n.code,i)}_renderTable(e){const t=function(e,t=zn){const n="preview"===e.outcome;return(e.gates??[]).map(e=>({gate:e.gate,label:`G${e.gate}`,move:En(e.move,n,t),still:En(e.still,n,t),unused:Cn(e)}))}(e,this._maxOf),n=function(e){const t=e.gates??[],n=[];if("ld2412"===e.profile){const i=t.filter(e=>e.move.flags.includes("unused")||e.still.flags.includes("unused")),s=e.min_gate??null,o=e.max_gate??null,r=i.filter(e=>null!==s&&e.gate<s).map(e=>e.gate),a=i.filter(e=>null!==o&&e.gate>o).map(e=>e.gate);return r.length&&n.push(`${Mn(r)}: not used (below Min Gate ${s})`),a.length&&n.push(`${Mn(a)}: not used (beyond Max Gate ${o})`),n}const i=t.filter(e=>e.move.flags.includes("unused")).map(e=>e.gate),s=t.filter(e=>e.still.flags.includes("unused")).map(e=>e.gate);return i.length&&n.push(`${Mn(i)}: not used (beyond Max Move Gate ${e.max_move_gate??"?"})`),s.length&&n.push(`${Mn(s)}: not used (beyond Max Still Gate ${e.max_still_gate??"?"})`),n}(e),i=e=>e.includes("unused")?"unused":"";return Z`
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
              ${t.map(e=>Z`
      <tr class=${e.unused?"unused":""}>
        <th scope="row">${e.label}</th>
        <td class=${i(e.move.flags)}>${e.move.peak}</td>
        <td class="threshold ${i(e.move.flags)}">${ni(e.move.text)}</td>
        <td class=${i(e.still.flags)}>${e.still.peak}</td>
        <td class="threshold ${i(e.still.flags)}">${ni(e.still.text)}</td>
      </tr>
    `)}
            </tbody>
          </table>
        </div>
        ${n.map(e=>Z`<p class="footnote">${e}</p>`)}
      </div>
    `}_renderIdle(e){const t=this._online(),n=e.snapshots??[];return Z`
      <div class="section">
        ${this._renderBanner(e)}
        ${t?this._renderIdleBody(e):Z`<div class="status" aria-live="polite"><p>${"Radar is offline. Calibration needs the radar online and its gate entities enabled."}</p></div>`}
        ${this._renderIdleButtons(e,t)}
        ${this._renderFooter(e,n)}
      </div>
    `}_renderIdleBody(e){var t,n;const i=(null===(t=this._config)||void 0===t||null===(t=t.calibration)||void 0===t?void 0:t.settle_s)??15,s=(null===(n=this._config)||void 0===n||null===(n=n.calibration)||void 0===n?void 0:n.duration_s)??60,o="ld2412"===this._profileKey(),r=this._engineeringOn()?"Radar Engineering Mode is already on and will stay on.":"Home Assistant turns Radar Engineering Mode on for the listen and back off afterward.",a=!(!this.hass||!this._resolved)&&function(e,t,n,i=[]){if("ld2410"!==n||i.length>0)return!1;const s=xe,o=(t,n)=>{if(0===n.length)return!1;for(let s=0;s<n.length;s++){var i;const o=t[s];if(!o)return!1;const r=null===(i=e.states[o])||void 0===i?void 0:i.state;if(void 0===r)return!1;const a=parseFloat(r);if(!Number.isFinite(a)||a!==n[s])return!1}return!0};return o(t.move_threshold,s.move)&&o(t.still_threshold,s.still)}(this.hass,this._resolved.map,this._profileKey(),e.snapshots??[]),l=this._offGatesLine(e);return Z`
      <div class="idle-body">
        <p>${function(e,t){const n=`listens for ${pn(t)}, then sets every gate's move and still threshold a margin above the background it heard.`;return`Teach the radar what your empty room looks like. ${e>0?`It counts down ${pn(e)} so you can leave, ${n}`:`It ${n}`} Your current thresholds are saved first, so you can undo.`}(i,s)}</p>
        <ul>
        <li>Nobody in the radar's view: people, pets, robot vacuums.</li>
        <li>
          Fans, curtains and plants that normally move are part of the background. Leave them
          as they usually are.
        </li>
        <li>${r}</li>
        ${o?Z`<li>
              LD2412: run Start Dynamic Background Correction (Controls card) first with the
              room empty and wait for its status to turn off. Calibrate afterward.
            </li>`:q}
        ${o&&this._backgroundOn()?Z`<li>
              Background correction is running on the LD2412. Wait for its status to turn off.
            </li>`:q}
        </ul>
        ${l?Z`<p class="warning">${l}</p>`:q}
        ${a?Z`<p class="hint">${"These look like factory thresholds. Calibrating sets them for your room."}</p>`:q}
      </div>
    `}_offGatesLine(e){if(!this.hass||!this._resolved)return null;const t=this._resolved.map,n=this._profileKey(),i=function(e,t,n,i){return"ld2412"===n?{max_move_gate:null,max_still_gate:null,min_gate:Fn(e,t.max_still_distance)??(null==i?void 0:i.min_gate)??null,max_gate:Fn(e,t.max_move_distance)??(null==i?void 0:i.max_gate)??null}:{max_move_gate:Fn(e,t.max_move_distance)??(null==i?void 0:i.max_move_gate)??null,max_still_gate:Fn(e,t.max_still_distance)??(null==i?void 0:i.max_still_gate)??null,min_gate:null,max_gate:null}}(this.hass,t,n,e.entities);return function(e){if(0===e.length)return null;const t=e=>`G${e.gate} ${e.channel}`;if(1===e.length){const t=e[0];return`The ${In(t.gate,t.channel)} is off (set to ${kn(t.max)}). Calibrating will turn it back on.`}const n=e[0].max;return(e.every(e=>e.max===n)?`These thresholds are off (set to ${kn(n)}): ${e.map(t).join(", ")}.`:`These thresholds are off: ${e.map(e=>`${t(e)} (set to ${kn(e.max)})`).join(", ")}.`)+" Calibrating will turn them back on."}(function(e,t,n,i,s){const o=[],r=Math.max(t.move_threshold.length,t.still_threshold.length);for(let l=0;l<r;l++)for(const r of nn){var a;if("ld2410"===n&&"still"===r&&l<=1)continue;if(!Nn(n,i,l,r))continue;const d=("move"===r?t.move_threshold:t.still_threshold)[l],c=("move"===r?t.move_energy:t.still_energy)[l];if(!d||!c||void 0===e.states[c])continue;const u=parseFloat((null===(a=e.states[d])||void 0===a?void 0:a.state)??"");if(!Number.isFinite(u))continue;const h=Tn(e,d);Math.abs(u-h)>tn||Un(s,l,r,h)||o.push({gate:l,channel:r,max:h})}return o}(this.hass,t,n,i,e.last_result))}_renderIdleButtons(e,t){const n=function(e,t,n=(()=>{var t;return null==e||null===(t=e.entities)||void 0===t?void 0:t.background_status_on})()??!1){return!(!t||!(null==e?void 0:e.entities)||e.job||!e.entities.engineering_mode||n)}(e,t,this._backgroundOn())&&!!this._apiHass();return Z`
      <div class="actions">
        <div class="buttons">
          <button type="button" class="primary" ?disabled=${!n} @click=${()=>this._start(!0)}>
            ${ti}
          </button>
          <button type="button" class="text" ?disabled=${!n} @click=${()=>this._start(!1)}>
            Preview only
          </button>
        </div>
        <p class="helper">${"Computes new thresholds without changing any of them. Radar Engineering Mode is still turned on for the listen."}</p>
      </div>
    `}_renderFooter(e,t){const n=e.last_result;if(!t.length&&!n)return q;const i=function(e){const t=e[0];return t&&null!==jn(e,0)?`Saved ${_n(t.taken_at)}.`:null}(t);return Z`
      <div class="footer">
        ${t.length?Z`
              <div class="last">
                ${n?Z`<p>${function(e){const t=_n(e.finished_at),n="restore"===e.kind?"restore":!1===e.apply?"preview":"calibration";switch(e.outcome){case"applied":case"partial":return`Last calibrated ${t}, ${Zn(e)}.`;case"restored":return`Last restored ${t}.`;case"preview":return`Last previewed ${t}.`;case"cancelled":return`Last ${n} ${t} was stopped${qn(e)}`;default:var i;return"cancelled_by_shutdown"===(null===(i=e.error)||void 0===i?void 0:i.code)?`Last ${n} ${t} was stopped by a Home Assistant restart${qn(e)}`:`Last ${n} ${t} failed${qn(e)}`}}(n)}</p>`:q}
                <div class="buttons">
                  <button
                    type="button"
                    class="secondary"
                    title=${Hn(t)??q}
                    @click=${()=>this._undo()}
                  >
                    ${Bn(t)}
                  </button>
                </div>
                ${i?Z`<p class="helper">${i}</p>`:q}
              </div>
            `:q}
        ${n?Z`
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
                ${this._showLastResult?this._renderStoredResult(n):q}
              </div>
            `:q}
      </div>
    `}_renderStoredResult(e){if("failed"===e.status||"failed"===e.outcome)return Z`<div class="stored"><p class="error">${Vn(e)}</p></div>`;const t=this._warningLines(e).map(e=>Z`<p class="warning">${e}</p>`);if("restore"===e.kind)return Z`<div class="stored">
        ${function(e){const t=[Wn(e)],n=Yn(e);return n&&t.push(n),t}(e).map(e=>Z`<p>${e}</p>`)} ${t}
      </div>`;const n=(e.gates??[]).length>0;return Z`<div class="stored">
      <p>${Wn(e)}</p>
      ${n?this._renderTable(e):q} ${t}
    </div>`}_renderBanner(e){const t=e.interrupted;if(!t)return q;const n=this._engineeringOn()&&("engineering"===t.phase||t.left_on),i="applying"===t.phase;if(!n&&!i)return q;const s=t.left_on?"The last calibration could not turn Radar Engineering Mode back off (the radar was offline).":"restore"===t.kind?"A restore was interrupted by a restart.":"A calibration was interrupted by a restart.",o=e.snapshots??[],r=o.find(e=>e.id===t.snapshot_id)??o[0],a=r?hn(r.taken_at):"the start";return Z`
      <div class="banner" role="status">
        <p>${s}</p>
        ${n?Z`<p>
              Radar Engineering Mode may still be on.
              <button type="button" class="secondary" @click=${this._turnOff}>Turn it off</button>
            </p>`:q}
        ${n&&this._turnOffError?Z`<p class="error" role="alert">${this._turnOffError}</p>`:q}
        ${i?Z`<p>
              Some thresholds may have been written. Undo restores the values saved at
              ${a}.
              <button type="button" class="secondary" ?disabled=${!r} @click=${()=>this._undo()}>
                Undo
              </button>
            </p>`:q}
      </div>
    `}};si.styles=r`
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
  `,Rt([pe({attribute:!1})],si.prototype,"hass",void 0),Rt([ve()],si.prototype,"_config",void 0),Rt([ve()],si.prototype,"_payload",void 0),Rt([ve()],si.prototype,"_local",void 0),Rt([ve()],si.prototype,"_loadState",void 0),Rt([ve()],si.prototype,"_loadError",void 0),Rt([ve()],si.prototype,"_failure",void 0),Rt([ve()],si.prototype,"_stopError",void 0),Rt([ve()],si.prototype,"_turnOffError",void 0),Rt([ve()],si.prototype,"_showLastResult",void 0),Rt([ve()],si.prototype,"_readingSettings",void 0),Rt([ve()],si.prototype,"_readSettingsError",void 0),rt(ei,si);var oi=window.customCards=window.customCards||[];oi.some(e=>"apollo-radar-calibrate-card"===e.type)||oi.push({type:ei,name:"Apollo Radar Auto-Calibrate",description:"One-button empty-room calibration of every gate threshold on an Apollo MSR (LD2410) or R PRO (LD2412), with undo.",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"});var ri=/(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$/,ai=/(?:_ld2450)?_target_(\d+)_y(?:_\d+)?$/;function li(e,t){for(const[n]of me(e.entities,t))if(n.startsWith("sensor.")&&ri.test(n.slice(n.indexOf(".")+1)))return!0;return!1}function di(e){try{const t=e();t&&"function"==typeof t.catch&&t.catch(()=>{})}catch{}}var ci,ui=class{constructor(e){this._activity="unknown",this._unsubscribe=null,this._serial=0,this._pending=!1,this._retryTimer=null,this._retryIndex=0,this._refused=!1,this._onReady=()=>this._reopen(),this._onDisconnected=()=>this._cancelRetry(),this._entryFeed=null,this._entryFeedSerial=0,this._onChange=e}get activity(){return this._activity}watch(e,t){var n;const i=null==e?void 0:e.connection;(null==i?void 0:i.subscribeMessage)&&t?(t===this._deviceId&&i===(null===(n=this._api)||void 0===n?void 0:n.connection)||(this.close(),this._api={connection:i},this._deviceId=t),this._listen(i),this._openEntryFeed(i),this._open()):this.close()}close(){this._retryIndex=0,this._closeFeed(),this._unlisten(),this._closeEntryFeed(),this._api=void 0,this._deviceId=void 0,this._set("unknown")}_set(e){e!==this._activity&&(this._activity=e,this._onChange())}_open(){const e=this._api,t=this._deviceId;if(!e||!t||this._unsubscribe||this._pending||this._retryTimer)return;if(this._refused)return;const n=++this._serial;this._pending=!0,Dt(e,t,e=>{n===this._serial&&this._set(function(e){var t;const n=null==e?void 0:e.job;return n?an(n.status)&&(null==e||null===(t=e.last_result)||void 0===t?void 0:t.job_id)===n.job_id?"idle":"running":"idle"}(e))}).then(e=>{n===this._serial?(this._pending=!1,this._unsubscribe=e,this._retryIndex=0):di(e)},e=>{if(n!==this._serial)return;if(this._pending=!1,this._set("idle"),"not_loaded"!==(null==e?void 0:e.code)||this._retryIndex>=Mt.length)return void(this._refused=!0);const t=Mt[this._retryIndex];this._retryIndex+=1,this._retryTimer=setTimeout(()=>{this._retryTimer=null,this._open()},t)})}_closeFeed(){this._serial+=1,this._pending=!1,this._refused=!1,this._cancelRetry();const e=this._unsubscribe;this._unsubscribe=null,e&&di(e)}_reopen(){this._retryIndex=0,this._closeFeed(),this._open()}_cancelRetry(){null!==this._retryTimer&&(clearTimeout(this._retryTimer),this._retryTimer=null)}_listen(e){e!==this._listened&&(this._unlisten(),e.addEventListener&&(e.addEventListener("ready",this._onReady),e.addEventListener("disconnected",this._onDisconnected),this._listened=e))}_unlisten(){const e=this._listened;this._listened=void 0,(null==e?void 0:e.removeEventListener)&&(e.removeEventListener("ready",this._onReady),e.removeEventListener("disconnected",this._onDisconnected))}_openEntryFeed(e){const t=this._api;if(!t||this._entryFeedConnection===e)return;this._closeEntryFeed(),this._entryFeedConnection=e;const n=++this._entryFeedSerial;Pt(t,()=>{n===this._entryFeedSerial&&this._reopen()}).then(e=>{n===this._entryFeedSerial?this._entryFeed=e:e&&di(e)})}_closeEntryFeed(){this._entryFeedSerial+=1,this._entryFeedConnection=void 0;const e=this._entryFeed;this._entryFeed=null,e&&di(e)}},hi="apollo_mmwave",_i="(?:_\\d+)?$",pi=/(?:^|_)(?:ld2410|ld2412)$/,vi=/(?:^|_)zone_\d+$/,fi=e=>({re:new RegExp(`(?:^|_)ld2450_${e}${_i}`),notAfter:[]}),gi=(e,t=[pi])=>({re:new RegExp(`(?:^|_)${e}${_i}`),notAfter:t}),mi=(e,t,n)=>({slot:{kind:"scalar",key:e},domain:t,spellings:n}),yi=e=>[fi(e),gi(e)],$i=e=>[fi(e),gi(e,[pi,vi])],bi=[mi("zone_type","select",yi("zone_type")),mi("multi_target_tracking","switch",yi("multi_target_tracking")),mi("timeout","number",yi("timeout")),mi("bluetooth","switch",[fi("bluetooth")]),mi("restart","button",[fi("restart")]),mi("factory_reset","button",[fi("factory_reset"),(ci="factory_reset_ld2450",{re:new RegExp(`(?:^|_)${ci}${_i}`),notAfter:[]})]),mi("presence","binary_sensor",[fi("presence")]),mi("moving_target","binary_sensor",[fi("moving_target")]),mi("still_target","binary_sensor",[fi("still_target")]),mi("presence_target_count","sensor",yi("presence_target_count")),mi("still_target_count","sensor",$i("still_target_count")),mi("moving_target_count","sensor",$i("moving_target_count"))];for(let ho=1;ho<=3;ho++)for(const e of["distance","direction","speed"])bi.push({slot:{kind:"target",index:ho-1,key:e},domain:"sensor",spellings:yi(`target_${ho}_${e}`)});for(let ho=1;ho<=3;ho++){for(const e of["x1","y1","x2","y2"])bi.push({slot:{kind:"zone",index:ho-1,key:e},domain:"number",spellings:yi(`zone_${ho}_${e}`)});for(const e of["all","still","moving"])bi.push({slot:{kind:"zone",index:ho-1,key:`${e}_target_count`},domain:"sensor",spellings:yi(`zone_${ho}_${e}_target_count`)})}function wi(e,t,n){for(let i=0;i<t.length;i++){const{re:s,notAfter:o}=t[i],r=s.exec(e);if(r){if(n){if(0!==r.index)continue}else{const t=e.slice(0,r.index);if(o.some(e=>e.test(t)))continue}return i}}return-1}function xi(e,t,n){const i=[];for(const s of bi){if(s.domain!==e)continue;const o=wi(t,s.spellings,n);o>=0&&i.push([s,o])}return i}function ki(e,t,n){"scalar"===t.kind?e[t.key]=n:"target"===t.kind?e.targets[t.index][t.key]=n:e.zones[t.index][t.key]=n}var Si=/* @__PURE__ */new WeakMap;function Ti(e,t){let n=Si.get(e.entities);n||(n=/* @__PURE__ */new Map,Si.set(e.entities,n));const i=n.get(t);if(i)return i;const s={targets:Array.from({length:3},()=>({})),zones:Array.from({length:3},()=>({}))},o=/* @__PURE__ */new Map,r=Me(e,t);for(const[a,l]of me(e.entities,t)){if(l.platform===hi)continue;const e=a.indexOf("."),t=a.slice(0,e),n=a.slice(e+1),i=void 0!==r&&n.startsWith(`${r}_`)?n.slice(r.length+1):void 0;let d=void 0!==i?xi(t,i,!0):[];0===d.length&&(d=xi(t,n,!1));for(const[r,l]of d){const e=o.get(r);void 0!==e&&e<=l||(o.set(r,l),ki(s,r.slot,a))}}return n.set(t,s),s}function zi(e){return e.zones.flatMap(e=>[e.x1,e.y1,e.x2,e.y2]).filter(e=>void 0!==e)}var Ri=/^binary_sensor\..+_zone_(\d+)_presence(?:_\d+)?$/;function Ai(e){const t=Ri.exec(e);return t?parseInt(t[1],10):Number.POSITIVE_INFINITY}function Ei(e,t){const n=[];for(const[i,s]of me(e.entities,t))i.startsWith("binary_sensor.")&&(s.platform===hi||!s.platform&&Ri.test(i))&&n.push(i);return n.sort((e,t)=>{const n=Ai(e),i=Ai(t);return n===i?0:n<i?-1:1})}function Ci(e){return void 0!==e&&"unavailable"!==e.state}function Mi(e){return Ci(e)&&"unknown"!==e.state}function Ii(e,t){var n;const i=t.zone_type,s=i?e.states[i]:void 0;if(!i||!Ci(s))return;const o=s.state;if("Disabled"===o||"unknown"===o)return;const r=null===(n=s.attributes)||void 0===n?void 0:n.options,a={setting:"zone_type",name:"Zone Type",entityId:i,fix:Array.isArray(r)&&!r.includes("Disabled")?void 0:{domain:"select",service:"select_option",data:{entity_id:i,option:"Disabled"},label:"Set Zone Type to Disabled",clause:"sets Zone Type to Disabled",progress:"Setting Zone Type to Disabled..."}};if("Detection"===o){const n=function(e,t){const n=zi(t);return 0!==n.length&&n.every(t=>{var n;const i=null===(n=e.states[t])||void 0===n?void 0:n.state;return void 0!==i&&""!==i.trim()&&0===Number(i)})}(e,t)?"None are set, so it reports nobody and the zone map stays empty.":"Anyone outside them is missing from the zone map.";return{...a,level:"warning",text:`Zone Type is Detection. This radar only reports people inside its built-in zones. ${n}`,hint:"Zone Type should be Disabled. The zone map replaces the radar's built-in zones."}}return"Filter"===o?{...a,level:"note",text:"Zone Type is Filter. This radar ignores people inside its built-in zones. Disabled is recommended because the zone map replaces them."}:{...a,level:"note",text:`Zone Type is ${o}. Disabled is recommended because the zone map replaces the radar's built-in zones.`}}function Li(e,t){var n;const i=t.multi_target_tracking;if(i&&"off"===(null===(n=e.states[i])||void 0===n?void 0:n.state))return{setting:"multi_target_tracking",name:"Multi Target Tracking",entityId:i,level:"warning",text:"Multi Target Tracking is off. Only one person is tracked.",fix:{domain:"switch",service:"turn_on",data:{entity_id:i},label:"Turn on Multi Target Tracking",clause:"turns on Multi Target Tracking",progress:"Turning on Multi Target Tracking..."}}}var Di=["Start Zone 1","End Zone 1","End Zone 2","End Zone 3"];function Pi(e){return String(Number(e.toFixed(2)))}function Oi(e){return e.length<3?e.join(" and "):`${e.slice(0,-1).join(", ")}, and ${e[e.length-1]}`}function Fi(e){return[...e.move_threshold,...e.still_threshold].filter(e=>!!e)}function Ni(e){return[e.zone_1_start,e.end_zone_1,e.end_zone_2,e.end_zone_3]}function Ui(e,t){return[e.engineering_mode,e.query_params,...Fi(e),e.max_move_distance,e.max_still_distance,e.radar_timeout,..."ld2410"===t.key?Ni(e):[]].filter(e=>!!e)}function ji(e,t,n){var i;const s=t.engineering_mode;if(s&&"idle"===n&&"on"===(null===(i=e.states[s])||void 0===i?void 0:i.state))return{setting:"engineering_mode",name:"Radar Engineering Mode",entityId:s,level:"note",text:"Radar Engineering Mode is on, so every gate's energy is saved to the database about once a second.",hint:"Turn it off when you finish tuning. The Gate Energy chart needs it only while you watch it.",fix:{domain:"switch",service:"turn_off",data:{entity_id:s},label:"Turn off Radar Engineering Mode",clause:"turns off Radar Engineering Mode",progress:"Turning off Radar Engineering Mode...",failure:"Could not turn Radar Engineering Mode off"}}}function Bi(e,t){const n=t=>{var n;return!!t&&"unknown"===(null===(n=e.states[t])||void 0===n?void 0:n.state)},i=[["gate thresholds",Fi(t)],["detection range",[t.max_move_distance,t.max_still_distance]],["timeout",[t.radar_timeout]]],s=i.filter(([,e])=>e.some(n)).map(([e])=>e);if(0===s.length)return;const o=i.flatMap(([,e])=>e).find(n),r=t.query_params&&Ci(e.states[t.query_params])?t.query_params:void 0;return{setting:"settings_unread",name:"the radar's settings",entityId:o,level:"note",text:`The radar has not reported its ${Oi(s)} yet, so those settings are blank.`,hint:r?"This only asks the radar to send them. Nothing on the radar changes.":"Press Query Params on the radar's device page to make it send them.",fix:r?{domain:"button",service:"press",data:{entity_id:r},label:sn,clause:"asks the radar for its settings",progress:on,failure:"Could not ask the radar for its settings",settleMs:3e3,noAnswer:"The radar has not sent its settings yet. Try again in a moment."}:void 0}}function Hi(e,t,n){const i=function(e,t){return Ni(t).map((t,n)=>{const i=ht(e,t);if(!t||void 0===i)return;const s=_t(e,t,"cm");return{entityId:t,label:Di[n],cm:ut(i,s,"cm"),text:`${Pi(i)} ${s}`,unit:s}})}(e,t),s=[],o=/* @__PURE__ */new Set,r=[];for(let c=1;c<=3;c++){const e=i[c-1],t=i[c];e&&t&&((1===c?e.cm>t.cm:t.cm<=e.cm)&&(o.add(c),r.push({entityId:t.entityId,line:1===c?`Zone 1 can never turn on. ${e.label} (${e.text}) must be smaller than ${t.label} (${t.text}).`:`Zone ${c} can never turn on. ${t.label} (${t.text}) must be larger than ${e.label} (${e.text}).`})))}r.length&&s.push({setting:"zone_order",name:"the zone distances",entityId:r[0].entityId,level:"warning",text:r.map(e=>e.line).join(" "),hint:"Each zone starts where the one before it ends. Change the distances on the Zone Config card."});const a=function(e,t){var n;const i=[ht(e,t.max_move_distance),ht(e,t.max_still_distance)].filter(e=>void 0!==e);if(0===i.length)return;const s=pt(t.gate_size?null===(n=e.states[t.gate_size])||void 0===n?void 0:n.state:void 0),o=void 0!==s&&s>0?s:.75;return Math.max(...i)*o*100}(e,t);if(void 0===a)return s;const l=e=>`about ${Pi(ut(a,"cm",e))} ${e}`,d=[];for(let c=1;c<=3;c++){const e=i[c-1],t=i[c];!o.has(c)&&t&&(e&&e.cm>=a?d.push({entityId:e.entityId,line:`Zone ${c} starts at ${e.text}, past the radar's reach of ${l(e.unit)}, so it can never turn on.`,never:!0}):t.cm>a&&d.push({entityId:t.entityId,line:`Zone ${c} ends at ${t.text}, past the radar's reach of ${l(t.unit)}.`,never:!1}))}if(d.length){const[e,t]=n.rangeLabels;s.push({setting:"zone_reach",name:"the zone distances",entityId:d[0].entityId,level:d.some(e=>e.never)?"warning":"note",text:d.map(e=>e.line).join(" "),hint:`The reach comes from ${e} and ${t}. Lower the zone distances, or raise those gates on the Detection Range card.`})}return s}function Zi(e,t,n){const i=ht(e,t.max_move_distance),s=ht(e,t.max_still_distance);if(void 0===i||void 0===s||s<i)return;const[o,r]=n.rangeLabels,a=`The ${n.label} only detects people from ${r} out to ${o}`;return{setting:"gate_range",name:r,entityId:t.max_still_distance,level:"warning",text:s>i?`${r} (${Pi(s)}) is above ${o} (${Pi(i)}). ${a}, so it may never see anyone.`:`${r} and ${o} are both ${Pi(s)}. ${a}, so it covers one narrow band.`,hint:`Set ${r} lower than ${o} on the Detection Range card.`}}var Gi="apollo-radar-setup-card";async function Wi(e,t){var n;return"not_found"===((null==t?void 0:t.code)??(null==t||null===(n=t.error)||void 0===n?void 0:n.code))?"Home Assistant could not find this setting. Reload the page and try again.":Zt(e,t)}var qi=class extends ce{constructor(...e){super(...e),this._serial=0,this._jobWatch=new ui(()=>this.requestUpdate())}setConfig(e){this._config=e,this._radarConfig={type:e.type,...e.device_id?{device_id:e.device_id}:{}}}getCardSize(){return 2}static getStubConfig(e){const t=`custom:${Gi}`;if(!e)return{type:t};const n=Object.keys(e.devices??{}),i=n.find(t=>li(e,t));if(i)return{type:t,device_id:i};const s=n.find(t=>void 0!==Ue(e,t));return s?{type:t,device_id:s,radar:"gate"}:{type:t}}connectedCallback(){super.connectedCallback(),this._watchJobs()}disconnectedCallback(){super.disconnectedCallback(),this._jobWatch.close(),this._endSettling(!1)}_isGate(){var e;return"gate"===(null===(e=this._config)||void 0===e?void 0:e.radar)}_resolve(){if(this._isGate()&&this.hass&&this._radarConfig)return this._resolved=Ye(this._resolved,this.hass,this._radarConfig),this._resolved}_watchJobs(){var e;this.isConnected&&this._isGate()?this._jobWatch.watch(this.hass,null===(e=this._config)||void 0===e?void 0:e.device_id):this._jobWatch.close()}_status(){var e;const t=null===(e=this._config)||void 0===e?void 0:e.device_id,n=this._resolve();return n?function(e,t,n,i,s){if(!t)return{kind:"no_device"};const o=i?Ui(n,i):[];if(!i||0===o.length)return{kind:"nothing_to_check"};const r=o.map(t=>e.states[t]);if(!r.some(Ci))return{kind:"offline"};const a=[ji(e,n,s),Bi(e,n),..."ld2410"===i.key?Hi(e,n,i):[Zi(e,n,i)]].filter(e=>void 0!==e);if(a.length)return{kind:"checked",problems:a};const l=n.engineering_mode?e.states[n.engineering_mode]:void 0;return"unknown"===s&&"on"===(null==l?void 0:l.state)?{kind:"checking"}:r.some(Mi)?{kind:"checked",problems:a}:{kind:"waiting"}}(this.hass,t,n.map,n.profile,this._jobWatch.activity):function(e,t){if(!t)return{kind:"no_device"};const n=Ti(e,t),i=[n.zone_type,n.multi_target_tracking].filter(e=>void 0!==e);if(0===i.length)return{kind:"nothing_to_check"};const s=i.map(t=>e.states[t]);if(!s.some(Ci))return{kind:"offline"};if(!s.some(Mi))return{kind:"waiting"};const o=[Ii(e,n),Li(e,n)].filter(e=>void 0!==e);return void 0===n.zone_type||Mi(e.states[n.zone_type])?{kind:"checked",problems:o}:o.length?{kind:"checked",problems:o,zoneTypeUnread:!0}:{kind:"waiting"}}(this.hass,t)}_watchedIds(){var e;const t=this._resolve();return t?(n=t.map,(i=t.profile)?[...Ui(n,i),n.gate_size].filter(e=>!!e):[]):function(e,t){if(!t)return[];const n=Ti(e,t);return[n.zone_type,n.multi_target_tracking,...zi(n)].filter(e=>void 0!==e)}(this.hass,null===(e=this._config)||void 0===e?void 0:e.device_id);var n,i}shouldUpdate(e){if(1!==e.size||!e.has("hass"))return!0;const t=e.get("hass");return!(t&&this.hass&&this._config)||(t.entities!==this.hass.entities||t.devices!==this.hass.devices||t.connection!==this.hass.connection||this._watchedIds().some(e=>t.states[e]!==this.hass.states[e]))}willUpdate(e){if(e.has("_config")||e.has("hass")){var t;const e=null===(t=this._config)||void 0===t?void 0:t.device_id;e!==this._deviceId&&(this._deviceId=e,this._serial++,this._endSettling(!1),this._busy=void 0,this._error=void 0,this._note=void 0),this._watchJobs()}if(!this.hass)return;const n=this._problems(),i=e=>n.some(t=>t.setting===e);this._error&&!n.length&&(this._error=void 0),this._note&&!i(this._note.setting)&&(this._note=void 0),this._settling&&!this._settling.problems.some(e=>i(e.setting))&&this._endSettling(!1)}_problems(){if(!this.hass)return[];const e=this._status();return"checked"===e.kind?e.problems:[]}async _apply(e){const t=this.hass,n=e.filter(e=>e.fix);if(!(null==t?void 0:t.callService)||this._busy||0===n.length)return;const i=this._serial;this._error=void 0,this._note=void 0,this._busy=n.length>1?"Applying recommended settings...":n[0].fix.progress;const s=t,o=await Promise.allSettled(n.map(e=>Ot(s,e.fix.domain,e.fix.service,e.fix.data))),r=[];for(let d=0;d<o.length;d++){const e=o[d];if("rejected"===e.status){const i=n[d].fix.failure??`Could not change ${n[d].name}`;r.push(`${i}: ${await Wi(t,e.reason)}`)}}if(i!==this._serial)return;this._error=r.length?r.join(" "):void 0;const a=n.filter((e,t)=>"fulfilled"===o[t].status&&void 0!==e.fix.settleMs),l=this._problems();if(a.some(e=>l.some(t=>t.setting===e.setting))){const e=Math.max(...a.map(e=>e.fix.settleMs));return void(this._settling={problems:a,timer:setTimeout(()=>{i===this._serial&&this._endSettling(!0)},e)})}this._busy=void 0}_endSettling(e){var t;const n=this._settling;if(!n)return;if(clearTimeout(n.timer),this._settling=void 0,this._busy=void 0,!e||!this.hass)return;const i=this._problems(),s=n.problems.find(e=>i.some(t=>t.setting===e.setting));(null==s||null===(t=s.fix)||void 0===t?void 0:t.noAnswer)&&(this._note={setting:s.setting,text:s.fix.noAnswer})}render(){return this.hass&&this._config?Z`
      <ha-card .header=${this._config.title??"Radar setup"}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `:q}_renderSubtitle(){var e,t,n;const i=null===(e=this._config)||void 0===e?void 0:e.device_id,s=i?null===(t=this.hass)||void 0===t?void 0:t.devices[i]:void 0,o=(null==s?void 0:s.name_by_user)||(null==s?void 0:s.name);if(!this._isGate())return o?Z`<div class="subtitle">LD2450 · ${o}</div>`:q;const r=[null===(n=this._resolve())||void 0===n||null===(n=n.profile)||void 0===n?void 0:n.label,o].filter(Boolean).join(" · ");return r?Z`<div class="subtitle">${r}</div>`:q}_renderBody(){const e=this._status();switch(e.kind){case"no_device":return Z`<p class="hint">${"Add device_id to this card's configuration to check the radar's settings."}</p>`;case"nothing_to_check":{const e=this._isGate()?"This device has no gate radar settings to check.":"This device has no Zone Type or Multi Target Tracking setting to check.";return Z`<p class="hint">${e}</p>`}case"offline":return Z`<p class="hint">${"Radar is offline. Its settings are checked once it reconnects."}</p>`;case"waiting":return Z`<p class="hint">${"Waiting for the radar to report its settings."}</p>`;case"checking":return Z`<p class="hint">${"Checking the radar's settings..."}</p>`;case"checked":return e.problems.length?this._renderProblems(e.problems,!!e.zoneTypeUnread):Z`<p class="ok">${"Radar settings look good."}</p>`}}_renderProblems(e,t){var n;const i=e.filter(e=>e.fix),s=!this._isGate()&&i.length>1,o=!!(null===(n=this.hass)||void 0===n?void 0:n.callService)&&!this._busy;return Z`
      <div class="problems">
        ${e.map(e=>Z`
            <div class="problem ${e.level}">
              <p class=${e.level}>${e.text}</p>
              ${e.hint?Z`<p class="hint">${e.hint}</p>`:q}
              ${e.fix&&!s?Z`<div class="buttons">
                    <button
                      type="button"
                      class="primary"
                      ?disabled=${!o}
                      @click=${()=>this._apply([e])}
                    >
                      ${e.fix.label}
                    </button>
                  </div>`:q}
            </div>
          `)}
        ${s?Z`<div class="combined">
              <div class="buttons">
                <button
                  type="button"
                  class="primary"
                  ?disabled=${!o}
                  @click=${()=>this._apply(i)}
                >
                  ${"Use recommended settings"}
                </button>
              </div>
              <p class="hint">${function(e){const t=e.map(e=>e.clause).join(" and ");return`${t.charAt(0).toUpperCase()}${t.slice(1)}.`}(i.map(e=>e.fix))}</p>
            </div>`:q}
        ${t?Z`<p class="hint">${"Waiting for the radar to report its Zone Type."}</p>`:q}
        <div class="status" aria-live="polite">
          ${this._busy?Z`<p class="hint">${this._busy}</p>`:q}
          ${this._note?Z`<p class="hint">${this._note.text}</p>`:q}
          ${this._error?Z`<p class="error">${this._error}</p>`:q}
        </div>
      </div>
    `}};qi.styles=r`
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
    .problem + .problem {
      border-top: 1px solid var(--divider-color, #e0e0e0);
      padding-top: 8px;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    .ok {
      margin: 0;
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
      margin: 8px 0;
    }
    button {
      font: inherit;
      cursor: pointer;
      border-radius: 4px;
      padding: 8px 16px;
      border: 1px solid var(--primary-color);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-weight: 500;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .status p:last-child {
      margin-bottom: 0;
    }
  `,Rt([pe({attribute:!1})],qi.prototype,"hass",void 0),Rt([ve()],qi.prototype,"_config",void 0),Rt([ve()],qi.prototype,"_busy",void 0),Rt([ve()],qi.prototype,"_error",void 0),Rt([ve()],qi.prototype,"_note",void 0),rt(Gi,qi),at(Gi,"Apollo Radar Setup","Checks an Apollo radar's settings and offers one-click fixes: the LD2450 on an R PRO-1 or MTR-1, or the gate radar on an MSR-1, MSR-2 or R PRO-1.");var Ji,Vi,Ki="apollo-radar-slider-row",Xi="apollo-radar-slider-lock-row",Yi=3e5,Qi="Unlock",es=/* @__PURE__ */new Map,ts=-1/0,ns=!1;function is(e){let t=es.get(e);return t||(t={unlocked:!1,deadline:0,drags:/* @__PURE__ */new Map,lastTry:-1/0,lastReminder:-1/0,listeners:/* @__PURE__ */new Set},es.set(e,t)),t}function ss(e,t){for(const n of[...e.listeners])n(t)}function os(e){clearTimeout(e.timer),e.timer=void 0,e.unlocked&&(e.unlocked=!1,ss(e,"lock"))}function rs(e,t){t.deadline=Date.now()+Yi,clearTimeout(t.timer),t.timer=setTimeout(()=>as(e),Yi)}function as(e){const t=es.get(e);if(!(null==t?void 0:t.unlocked))return;const n=t.deadline-Date.now();if(n>0)return clearTimeout(t.timer),void(t.timer=setTimeout(()=>as(e),n));t.drags.size>0||os(t)}function ls(){for(const e of[...es.keys()])as(e)}function ds(e){for(const[t,n]of es){let i=!1;for(const[t,s]of n.drags)e(t,s)&&(n.drags.delete(t),i=!0);!i||n.drags.size>0||n.unlocked&&Date.now()>=n.deadline&&setTimeout(()=>as(t),0)}}function cs(e){ds(t=>t===e.pointerId)}function us(){ds((e,t)=>"touch"!==t)}function hs(){if("hidden"===document.visibilityState)for(const e of es.values())e.drags.clear();else ls()}function _s(){ts=Date.now()}function ps(){ns||(ns=!0,window.addEventListener("pointerup",cs,{capture:!0,passive:!0}),window.addEventListener("pointercancel",cs,{capture:!0,passive:!0}),window.addEventListener("contextmenu",us,{capture:!0,passive:!0}),document.addEventListener("visibilitychange",hs),window.addEventListener("pageshow",ls),window.addEventListener("scroll",_s,{passive:!0}))}function vs(e){var t;return(null===(t=es.get(e))||void 0===t?void 0:t.unlocked)??!1}function fs(e,t){const n=es.get(e);t?(null==n?void 0:n.listeners.size)&&(n.unlocked=!0,n.lastTry=-1/0,n.lastReminder=-1/0,rs(e,n),ss(n,"lock")):n&&os(n)}function gs(e,t){ps();const n=is(e);clearTimeout(n.leaveTimer),n.leaveTimer=void 0,n.listeners.add(t);let i=!0;return()=>{i&&(i=!1,n.listeners.delete(t),n.listeners.size>0||(clearTimeout(n.leaveTimer),n.leaveTimer=setTimeout(()=>{n.listeners.size>0||(os(n),es.get(e)===n&&es.delete(e))},2e3)))}}function ms(e){if(!e)return!1;const{mode:t,min:n,max:i,step:s}=e.attributes;return"slider"===t||"auto"===t&&(Number(i)-Number(n))/Number(s)<=256}var ys=/* @__PURE__ */new Set(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"]);function $s(e){return e.composedPath().some(e=>e instanceof Element&&("ha-slider"===e.localName||"slider"===e.getAttribute("role")||"input"===e.localName&&"range"===e.type))}function bs(e){return`apollo-mmwave-sliders-${e}`}function ws(e,t,n){e.dispatchEvent(new CustomEvent(t,{bubbles:!0,composed:!0,detail:n}))}var xs=class extends ce{constructor(...e){super(...e),this._nudge=!1,this._serial=0,this._keyCapture={handleEvent:e=>this._onKey(e),capture:!0},this._changeCapture={handleEvent:e=>this._onChange(e),capture:!0},this._downCapture={handleEvent:e=>this._onSliderDown(e),capture:!0}}setConfig(e){var t;if(!(null==e?void 0:e.entity)||!e.device_id)throw new Error("Apollo mmWave: a slider row needs entity and device_id.");const n=e.device_id!==(null===(t=this._config)||void 0===t?void 0:t.device_id);this._config=e,n&&this.isConnected&&this._watch(),this._buildRow()}connectedCallback(){super.connectedCallback(),this._watch()}disconnectedCallback(){var e;super.disconnectedCallback(),null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=void 0,clearTimeout(this._nudgeTimer),this._nudge=!1,this._gesture=void 0}_watch(){var e;null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=this._config?gs(this._config.device_id,e=>{"lock"===e&&this.requestUpdate()}):void 0,this.requestUpdate()}async _buildRow(){const e=++this._serial,t=await function(){const e=window.loadCardHelpers;return"function"!=typeof e?Promise.resolve(void 0):(e!==Ji&&(Ji=e,Vi=Promise.resolve().then(()=>e()).catch(()=>{})),Vi)}(),n=this._config;if(e!==this._serial||!n)return;const i={...n};delete i.type,delete i.device_id;let s=null;try{s=(null==t?void 0:t.createRowElement({color:"state",...i}))??null}catch{s=null}s&&(s.hass=this.hass),this._row=s}shouldUpdate(e){if(e.has("hass")&&this._row&&(this._row.hass=this.hass),1!==e.size||!e.has("hass"))return!0;const t=e.get("hass");if(!t||!this.hass||!this._config)return!0;const n=this._config.entity;return t.states[n]!==this.hass.states[n]||t.localize!==this.hass.localize}_locked(){var e;const t=this._config;return!!t&&!!this._row&&!vs(t.device_id)&&ms(null===(e=this.hass)||void 0===e?void 0:e.states[t.entity])}render(){if(!this._config)return q;const e=this._locked(),t=this._row?this._row:null===this._row?this._renderFallback():q;return Z`
      <div
        class="row ${e?"locked":""} ${e&&this._nudge?"nudge":""}"
        @keydown=${this._keyCapture}
        @change=${this._changeCapture}
        @pointerdown=${this._downCapture}
      >
        <div class="native">${t}</div>
        ${e?Z`<div
              class="shield"
              aria-hidden="true"
              @pointerdown=${this._onDown}
              @pointermove=${this._onMove}
              @pointercancel=${this._onCancel}
              @click=${this._onClick}
            ></div>`:q}
      </div>
    `}_renderFallback(){var e,t,n;const i=this._config,s=null===(e=this.hass)||void 0===e?void 0:e.states[i.entity],o=i.name??(null==s?void 0:s.attributes.friendly_name)??i.entity,r=s?(null===(t=(n=this.hass).formatEntityState)||void 0===t?void 0:t.call(n,s))??s.state:"";return Z`<div class="fallback"><span>${o}</span><span>${r}</span></div>`}_inSliderZone(e){var t;const n=null===(t=this._row)||void 0===t||null===(t=t.shadowRoot)||void 0===t?void 0:t.querySelector("ha-slider");if(!n)return!0;const i=n.getBoundingClientRect();return!i.width||("rtl"===getComputedStyle(this).direction?e<=i.right+8:e>=i.left-8)}_onDown(e){!e.isPrimary||e.button>0||(this._gesture={id:e.pointerId,x:e.clientX,y:e.clientY,slider:this._inSliderZone(e.clientX),moved:!1})}_onMove(e){const t=this._gesture;if(!t||t.id!==e.pointerId||t.moved)return;if("touch"!==e.pointerType&&0===e.buttons)return void(this._gesture=void 0);const n=Math.abs(e.clientX-t.x),i=Math.abs(e.clientY-t.y);Math.max(n,i)<10||(t.moved=!0,t.slider&&n>i&&this._try(!1))}_onCancel(){this._gesture=void 0}_onClick(e){const t=this._gesture;if(this._gesture=void 0,(null==t?void 0:t.moved)||e.button>0)return;const n=this._config;var i;(t?t.slider:this._inSliderZone(e.clientX))?function(e=Date.now()){return e-ts<300}()||this._try(!1):(null===(i=this.hass)||void 0===i?void 0:i.states[n.entity])&&ws(this,"hass-more-info",{entityId:n.entity})}_onKey(e){ys.has(e.key)&&this._locked()&&$s(e)&&(e.preventDefault(),e.stopPropagation(),e.repeat||this._try(!0))}_onChange(e){const t=this._config;if(t&&$s(e))return this._locked()?(e.stopPropagation(),void this._buildRow()):void function(e){const t=es.get(e);(null==t?void 0:t.unlocked)&&rs(e,t)}(t.device_id)}_onSliderDown(e){const t=this._config;var n,i,s;!t||!e.isPrimary||e.button>0||this._locked()||!$s(e)||(n=t.device_id,i=e.pointerId,s=e.pointerType,ps(),is(n).drags.set(i,s))}_try(e){var t;const n=this._config,i=null===(t=this.hass)||void 0===t?void 0:t.states[n.entity];if(!i||"unavailable"===i.state)return;const s=n.device_id,o=function(e,t=!1,n=Date.now()){const i=is(e),s=n-i.lastTry<=1e4;return i.lastTry=n,ss(i,"try"),(t||s)&&n-i.lastReminder>=4e3?(i.lastReminder=n,"remind"):"nudge"}(s,e);if(this._nudge=!0,clearTimeout(this._nudgeTimer),this._nudgeTimer=setTimeout(()=>this._nudge=!1,1200),ws(this,"haptic","remind"===o?"warning":"light"),"remind"===o){ws(this,"hass-notification",{id:bs(s),message:"These sliders are locked. Press Unlock above them to change one.",duration:6e3,action:{text:Qi,action:()=>fs(s,!0)}})}}};xs.styles=r`
    :host {
      display: block;
    }
    .row {
      position: relative;
      min-height: 40px;
    }
    .native {
      display: block;
    }
    .locked .native {
      pointer-events: none;
    }
    /* HA's slider reads these: gray while locked, so it looks off and still
       shows where it is. The track keeps its own color. */
    .locked {
      --ha-slider-thumb-color: var(--secondary-text-color);
      --ha-slider-indicator-color: var(--secondary-text-color);
    }
    .locked.nudge {
      --ha-slider-thumb-color: var(--warning-color, #ffa600);
      --ha-slider-indicator-color: var(--warning-color, #ffa600);
    }
    /* Explicit sides rather than inset, for iOS 14 wall tablets. The second
       touch-action wins where pinch-zoom is known; pan-y stays where not. */
    .shield {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 1;
      cursor: pointer;
      touch-action: pan-y;
      touch-action: pan-y pinch-zoom;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
    }
    .fallback {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
    }
  `,Rt([pe({attribute:!1})],xs.prototype,"hass",void 0),Rt([ve()],xs.prototype,"_config",void 0),Rt([ve()],xs.prototype,"_row",void 0),Rt([ve()],xs.prototype,"_nudge",void 0);var ks=class extends ce{constructor(...e){super(...e),this._flash=""}setConfig(e){var t;if(!(null==e?void 0:e.device_id))throw new Error("Apollo mmWave: the slider lock row needs device_id.");const n=e.device_id!==(null===(t=this._config)||void 0===t?void 0:t.device_id);this._config=e,n&&this.isConnected&&this._watch()}connectedCallback(){super.connectedCallback(),this._watch()}disconnectedCallback(){var e;super.disconnectedCallback(),null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=void 0,clearTimeout(this._flashTimer),this._flash=""}_watch(){var e;null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=this._config?gs(this._config.device_id,e=>{"lock"===e?this.requestUpdate():this._flashButton()}):void 0,this.requestUpdate()}_flashButton(){this._flash="flash-a"===this._flash?"flash-b":"flash-a",clearTimeout(this._flashTimer),this._flashTimer=setTimeout(()=>this._flash="",1200)}shouldUpdate(e){return 1!==e.size||!e.has("hass")}_toggle(){const e=this._config.device_id,t=!vs(e);fs(e,t);ws(this,"hass-notification",{id:bs(e),message:t?"Sliders unlocked. They lock again after 5 minutes without a change.":"Sliders locked."})}render(){if(!this._config)return q;const e=vs(this._config.device_id);return Z`
      <div class="lock ${e?"unlocked":""}">
        <div class="icon" aria-hidden="true">
          <ha-icon .icon=${e?"mdi:lock-open-variant":"mdi:lock"}></ha-icon>
        </div>
        <div class="info" id="state">
          <div>${e?"Sliders unlocked":"Sliders locked"}</div>
          <div class="secondary">${e?"They lock again after 5 minutes without a change.":"A scroll cannot move them."}</div>
        </div>
        <button type="button" class=${this._flash} aria-describedby="state" @click=${this._toggle}>
          ${e?"Lock":Qi}
        </button>
      </div>
    `}};function Ss(e,t){return e?[{entity:e,name:t}]:[]}function Ts(e,t){return e?[{entity:e,name:t,slider:!0}]:[]}function zs(e,t,n,i){return e?[{entity:e,name:t,confirm:{text:n,action:i}}]:[]}function Rs(e,t){return zs(e,"Factory Reset Radar",`Reset the ${t} radar to its factory settings? It restarts and forgets its own settings.`,"Reset")}function As(e,t){return zs(e,"Restart Radar",`Restart the ${t} radar? It stops detecting for a few seconds while it starts up.`,"Restart")}ks.styles=r`
    :host {
      display: block;
    }
    .lock {
      display: flex;
      align-items: center;
      min-height: 40px;
    }
    .icon {
      flex: 0 0 40px;
      display: flex;
      justify-content: center;
      color: var(--state-icon-color);
    }
    .unlocked .icon {
      color: var(--primary-color);
    }
    .info {
      flex: 1 1 auto;
      min-width: 0;
      padding-inline: 16px 8px;
    }
    .secondary {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    button {
      flex: none;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      padding: 6px 16px;
      min-height: 36px;
      border: 1px solid var(--primary-color);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button.flash-a {
      animation: apollo-lock-flash-a 0.6s ease-in-out 2;
    }
    button.flash-b {
      animation: apollo-lock-flash-b 0.6s ease-in-out 2;
    }
    @keyframes apollo-lock-flash-a {
      50% {
        box-shadow: 0 0 0 4px var(--warning-color, #ffa600);
      }
    }
    @keyframes apollo-lock-flash-b {
      50% {
        box-shadow: 0 0 0 4px var(--warning-color, #ffa600);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      button.flash-a,
      button.flash-b {
        animation: none;
        box-shadow: 0 0 0 3px var(--warning-color, #ffa600);
      }
    }
  `,Rt([pe({attribute:!1})],ks.prototype,"hass",void 0),Rt([ve()],ks.prototype,"_config",void 0),Rt([ve()],ks.prototype,"_flash",void 0),rt(Ki,xs),rt(Xi,ks);var Es="Radar Bluetooth (HLK app)";function Cs(e,t){if("ft"===t){const t=e/.3048;return`about ${t<3?Number(t.toFixed(1)):Math.round(t)} ft`}return`about ${Number(e.toFixed(e<1?2:1))} m`}function Ms(e,t){return t.filter(t=>Ge(e,t.entity))}function Is(e,t){const n=e.zones[t];return[...Ss(n.x1,"X1"),...Ss(n.y1,"Y1"),...Ss(n.x2,"X2"),...Ss(n.y2,"Y2"),...Ss(n.all_target_count,"Target Count"),...Ss(n.still_target_count,"Still Target Count"),...Ss(n.moving_target_count,"Moving Target Count")]}function Ls(e){return void 0!==e&&"unavailable"!==e.state}function Ds(e,t){return!!t&&Ls(e.states[t])}function Ps(e,t,n){const i=je(e,t),s=[];return i&&s.push(i.engineering_mode,i.radar_timeout,i.max_move_distance,i.max_still_distance,i.radar_target,i.moving_target,i.still_target,i.detection_distance,...i.move_threshold,...i.still_threshold,...i.move_energy,...i.still_energy),s.push(...function(e,t){const n=[];for(const[i]of me(e.entities,t)){if(!i.startsWith("sensor."))continue;const e=i.slice(i.indexOf(".")+1);(ri.test(e)||ai.test(e))&&n.push(i)}return n}(e,t)),!!s.some(t=>Ds(e,t))||!s.some(e=>void 0!==e)&&(n&&me(e.entities,t).some(([t,n])=>"apollo_mmwave"!==n.platform&&Ds(e,t)))}function Os(e,t,n=!1){const i=e.devices[t];if(n&&!i)return;const s=function(e,t){let n=!1,i=!1;for(const[,s]of me(e.entities,t))if(n=!0,void 0!==s.platform&&(i=!0,"esphome"===s.platform))return!0;return n&&!i}(e,t)?Re(i):void 0,o=Me(e,t);if(!n&&!s&&!o)return;const r=Ps(e,t,!!s);if(!n&&!s&&!r)return;const a=Ue(e,t)??(null==s?void 0:s.profile),l=li(e,t)||((null==s?void 0:s.ld2450)??!1);return n||a||l?{deviceId:t,base:o??t,name:(null==i?void 0:i.name_by_user)||(null==i?void 0:i.name)||o||t,profile:a,ld2450:l,online:r}:void 0}function Fs(e,t){var n;if(t.device_id){const n=Os(e,t.device_id,!0);return n?[n]:[]}return(null===(n=t.devices)||void 0===n?void 0:n.length)?t.devices.map(t=>Os(e,t,!0)).filter(e=>void 0!==e):function(e){const t=[];for(const n of Object.keys(e.devices)){const i=Os(e,n);i&&t.push(i)}return t}(e)}function Ns(e,t,n={},i){if(0!==t.length)return{type:"entities",title:e,show_header_toggle:!1,...n,entities:Us(t,i)}}function Us(e,t){const n=[];let i=!1;for(const s of e)t&&s.slider?(i||(n.push({type:`custom:${Xi}`,device_id:t}),i=!0),n.push({type:`custom:${Ki}`,entity:s.entity,name:s.name,device_id:t})):n.push(Bs(s));return n}function js(e,t){return t.map(t=>{const n=e.states[t.entity];return t.slider&&void 0!==(null==n?void 0:n.attributes.mode)&&!ms(n)?{entity:t.entity,name:t.name}:t})}function Bs(e){return e.confirm?{type:"button",entity:e.entity,name:e.name,action_name:e.confirm.action,tap_action:{action:"perform-action",perform_action:"button.press",target:{entity_id:e.entity},confirmation:{text:e.confirm.text}}}:{entity:e.entity,name:e.name}}function Hs(e,t){const n=function(e,t){const n=(i=e.name,i.replace(/[!-\/:-@\[-`{-~]/g,"\\$&"));var i;if(!e.profile&&!e.ld2450)return{type:"markdown",content:`**${n}**: no radar data available right now.\n\nThe device looks offline (or exposes no recognizable radar entities). Its cards will appear here once it reports in.\n\n`+Zs(e)};if(!e.profile||e.ld2450&&!t.gateRadar)return{type:"markdown",content:`**${n}**, Apollo mmWave (LD2450 tracking radar).\n\nDraw occupancy zones over the live target positions below.\n\n**Start here**\n${Gs([...t.ld2450Setup?["Fix anything the Radar setup card flags."]:[],"Set **Cone rotation** (under Configure on the zone map) to match how the sensor is mounted.","Draw a zone on the map, reload this page, then walk into the zone and watch it turn on under Zone presence."])}\n\n${Ws}\n\n`+Zs(e)};const s=e.profile,o=`[Full tuning guide →](${s.wikiUrl}) · ${Zs(e)}`;if(!e.ld2450)return{type:"markdown",content:`**${n}**, Apollo ${s.label} radar.\n\n**Start here**\n${Gs(qs(s,t,!1))}\n\n`+o};const r=t.ld2450Setup?"fix anything Radar setup flags above the zone map, ":"",a=t.gatePresence?`**In automations**, use **${s.label} Presence** (Radar Target on this tab) for the whole room, or a zone's presence sensor for one part of it.`:Ws;return{type:"markdown",content:`**${n}**, Apollo mmWave with two radars. The **${s.label}** senses people anywhere in range, even sitting still. The **LD2450** tracks where people are and drives the zone map.\n\n**Start here**\n`+Gs([...qs(s,t,!0),`For the LD2450, ${r}set **Cone rotation** (under Configure on the zone map) to match how the sensor is mounted, then draw a zone and walk into it.`])+`\n\n${a}\n\n`+o}}(e,t);return e.online||!e.profile&&!e.ld2450||(n.content=`${n.content}\n\n**Offline right now.** Its entities are unavailable, so the cards below will fill in once it reconnects. If this radar was replaced or reflashed under a new name, delete the old device in Home Assistant to drop this tab.`),n}function Zs(e){return`[All settings for this device →](/config/devices/device/${encodeURIComponent(e.deviceId)})`}function Gs(e){return e.map((e,t)=>`${t+1}. ${e}`).join("\n")}var Ws="**In automations**, use a zone's presence sensor, or **LD2450 Presence** for anywhere the radar sees.";function qs(e,t,n){const i=n?`the ${e.label}`:"it",s=n?`${e.label} presence`:"presence",o=n?`the ${e.label}'s Radar setup card`:"the Radar setup card";return[...t.gateSetup?[`Fix anything ${o} flags.`]:[],"Press **Calibrate with empty room** on the Auto-calibrate card and leave the room.",`Set how far ${i} should look: **${e.rangeLabels[0]} / ${e.rangeLabels[1]}** on the Detection Range card (each gate is ${t.gateDepth}).`,`Set how long ${s} stays on after you stop moving: **Radar Timeout**, same card.`,"Walk the room and watch the Gate Energy chart. Raise a gate's threshold if it triggers with nobody there, lower it if it misses you."]}function Js(e){return{type:"markdown",content:e}}var Vs="Zone presence";var Ks="Device";function Xs(e,t,n){const i=function(e,t){const n={};for(const[i,s]of me(e.entities,t)){if("apollo_mmwave"===s.platform)continue;const e=i.indexOf("."),t=i.slice(0,e),o=i.slice(e+1);for(const s of We)s.domain===t&&void 0===n[s.slot]&&s.re.test(o)&&(n[s.slot]=i)}return n}(e,t.deviceId),s=function(e,t){return e.profile&&t&&e.ld2450?{name:"Restart device (both radars)",text:"Restart the whole device? Both radars stop, and the device is offline for a short while before it reconnects."}:e.ld2450?{name:"Restart device (also restarts the radar)",text:"Restart the whole device? The radar restarts with it, and the device is offline for a short while before it reconnects."}:{name:"Restart device",text:"Restart the whole device? It is offline for a short while before it reconnects."}}(t,n),o=Ns(Ks,Ms(e,function(e,t){return[...Ss(e.apollo_firmware,"Apollo firmware"),...Ss(e.ld2410_firmware,"LD2410 firmware"),...Ss(e.ld2412_firmware,"LD2412 firmware"),...Ss(e.ld2450_firmware,"LD2450 firmware"),...Ss(e.update,"Firmware update"),...zs(e.esp_reboot,t.name,t.text,"Restart")]}(i,s))),r=o?[o]:[];return Ge(e,i.rssi)&&r.push({type:"conditional",conditions:[{condition:"numeric_state",entity:i.rssi,below:-75}],card:{type:"markdown",content:"**Weak Wi-Fi.** The signal is below -75 dBm, so presence updates can lag or drop out. Move the device or your Wi-Fi router closer, or add an access point."}}),r.push({type:"markdown",...o?{}:{title:Ks},content:`${Zs(t)}\n\n**Download a support file** for Apollo support: open [Apollo mmWave](/config/integrations/integration/apollo_mmwave), then pick **Download diagnostics** from the three dots menu.`}),1===r.length?r[0]:{type:"vertical-stack",cards:r}}function Ys(e,t,n,i){const s=function(e){var t;return"mi"===(null===(t=e.config)||void 0===t||null===(t=t.unit_system)||void 0===t?void 0:t.length)?"ft":"m"}(e);let o=.75,r=!1,a=!1;const l={},d=!!t.profile&&t.ld2450,c=[];if(t.profile){const u=t.profile;l.calibrate={type:"custom:apollo-radar-calibrate-card",device_id:t.deviceId,device_base_name:t.base,title:"Auto-calibrate",...i?{calibration:i}:{}};const h=je(e,t.deviceId)??u.entityMap(t.base),_=u.label;l.gateSetup=Ui(h,u).some(t=>Ge(e,t))?{type:"custom:apollo-radar-setup-card",device_id:t.deviceId,radar:"gate"}:void 0,o=function(e,t){var n;const i=pt(t.gate_size?null===(n=e.states[t.gate_size])||void 0===n?void 0:n.state:void 0);return void 0!==i&&i>0?i:.75}(e,h),r=Ge(e,h.radar_target),a=!!l.gateSetup||r;const p=e=>function(e,t,n){return 0===e?"G0 (at the sensor)":`G${e} (${Cs(e*t,n)})`}(e,o,s);c.push(...function(e,t){return[...Ss(e.radar_target,t?`${t} Presence`:"Detected"),...Ss(e.moving_target,t?`${t} Moving`:"Moving"),...Ss(e.still_target,t?`${t} Still`:"Still"),...Ss(e.zone_occupancy,"Any zone"),...Ss(e.zone_1_occupancy,"Zone 1"),...Ss(e.zone_2_occupancy,"Zone 2"),...Ss(e.zone_3_occupancy,"Zone 3")]}(h,d?_:void 0));const v=Ns(`${_} Detection Range`,js(e,Ms(e,function(e,t,n){return[...Ss(e.radar_timeout,"Radar Timeout"),...Ss(e.gate_size,n),...Ts(e.max_move_distance,t[0]),...Ts(e.max_still_distance,t[1])]}(h,u.rangeLabels,u.gateSizeLabel))),{},t.deviceId),f=Ns(`${_} Move Thresholds`,js(e,Ms(e,function(e,t=e=>`G${e}`){const n=[];for(let i=0;i<e.move_threshold.length;i++)n.push(...Ts(e.move_threshold[i],t(i)));return n}(h,p))),{},t.deviceId),g=Ns(`${_} Still Thresholds`,js(e,Ms(e,function(e,t=e=>`G${e}`){const n=[];for(let i=0;i<e.still_threshold.length;i++)n.push(...Ts(e.still_threshold[i],t(i)));return n}(h,p))),{},t.deviceId);l.controls=Ns(`${_} Controls`,Ms(e,function(e,t){return[...Ss(e.engineering_mode,"Radar Engineering Mode"),...Ss(e.background_correction,"Start Dynamic Background Correction"),...Ss(e.background_correction_status,"Background Correction Running"),...Ss(e.bluetooth,Es),...As(e.restart_radar,t),...Rs(e.factory_reset_radar,t)]}(h,_))),l.range=v,l.rangeNote=v?Js(u.rangeTip(Cs(o,s))):void 0,l.zone=Ns(`${_} Zone Config`,Ms(e,function(e){return[...Ss(e.zone_1_start,"Start Zone 1"),...Ss(e.end_zone_1,"End Zone 1"),...Ss(e.end_zone_2,"End Zone 2"),...Ss(e.end_zone_3,"End Zone 3")]}(h))),l.zoneNote=l.zone?Js(function(e,t){return`💡 The boxes are in cm${"ft"===e?" (100 cm is about 3.3 ft)":""}. The zones sit back to back: Zone 1 runs from Start Zone 1 to End Zone 1, Zone 2 from there to End Zone 2, and Zone 3 from there to End Zone 3.`+(t?" In automations, use **Any zone**: it is on while someone is in any of the three zones, so it ignores people past End Zone 3.":"")}(s,Ge(e,h.zone_occupancy))):void 0,l.distance={type:"custom:apollo-radar-distance-card",device_id:t.deviceId,device_base_name:t.base,title:`${_} Distances`,...n?{distance_unit:n}:{}},l.gateEnergy={type:"custom:apollo-radar-gate-energy-card",device_id:t.deviceId,device_base_name:t.base,title:`${_} Gate Energy`},l.moveThr=f,l.stillThr=g,l.gateNote=f||g?Js(u.gateTip):void 0,l.occupancy=Ns(`${_} Target / Occupancy`,Ms(e,function(e){return[...Ss(e.radar_target,"Radar Target"),...Ss(e.moving_target,"Radar Moving Target"),...Ss(e.still_target,"Radar Still Target"),...Ss(e.zone_1_occupancy,"Radar Zone 1 Occupancy"),...Ss(e.zone_2_occupancy,"Radar Zone 2 Occupancy"),...Ss(e.zone_3_occupancy,"Radar Zone 3 Occupancy"),...Ss(e.zone_occupancy,"Any zone")]}(h)),{state_color:!0})}if(t.ld2450){l.zoneHeader=t.profile?{type:"heading",heading:"Zone Map"}:void 0;const n=Ti(e,t.deviceId);l.ld2450Setup=Ge(e,n.zone_type)||Ge(e,n.multi_target_tracking)?{type:"custom:apollo-radar-setup-card",device_id:t.deviceId}:void 0,l.zoneMap=(u=t.deviceId,h=t.name,{type:"custom:apollo-radar-zone-map-card",device_id:u,title:h,unit_display:!0}),l.zonePresence=function(e,t){const n=Ei(e,t).filter(t=>Ge(e,t));return 0===n.length?{type:"markdown",title:Vs,content:"Draw a zone on the map to get a presence sensor for it. Reload this page to see it here."}:{type:"entities",title:Vs,show_header_toggle:!1,state_color:!0,entities:n.map(e=>({type:"conditional",conditions:[{condition:"state",entity:e,state_not:"unavailable"}],row:{entity:e,state_color:!0}}))}}(e,t.deviceId),l.ld2450Live=Ns("LD2450 Live",Ms(e,function(e){return[...Ss(e.presence,"Presence"),...Ss(e.moving_target,"Moving Target"),...Ss(e.still_target,"Still Target"),...Ss(e.presence_target_count,"Target Count"),...e.targets.flatMap((e,t)=>[...Ss(e.distance,`Target ${t+1} Distance`),...Ss(e.direction,`Target ${t+1} Direction`)])]}(n)),{state_color:!0}),l.ld2450Controls=Ns("LD2450 Controls",Ms(e,function(e){return[...Ss(e.zone_type,"Zone Type"),...Ss(e.multi_target_tracking,"Multi Target Tracking"),...Ss(e.timeout,"Radar Timeout"),...Ss(e.bluetooth,Es),...As(e.restart,"LD2450"),...Rs(e.factory_reset,"LD2450")]}(n))),l.ld2450ControlsNote=Ge(e,n.timeout)?Js("💡 **Radar Timeout** is how long LD2450 Presence stays on after the radar last sees someone. It does not hold the zones you draw: a zone turns off as soon as nobody is in it."):void 0,l.builtInZones=function(e,t){if(!Ge(e,t.zone_type))return;const n=[];for(let i=0;i<3;i++){const s=Ms(e,Is(t,i));0!==s.length&&n.push({type:"section",label:`Zone ${i+1}`},...s.map(e=>({entity:e.entity,name:e.name})))}return 0!==n.length?{type:"conditional",conditions:[{condition:"state",entity:t.zone_type,state_not:["Disabled","unavailable","unknown"]}],card:{type:"vertical-stack",cards:[{type:"markdown",title:"Radar's built-in zones",content:"These are the radar chip's own zones, not the ones on the zone map. Zone Type Disabled is recommended, because the zone map replaces them."},{type:"entities",show_header_toggle:!1,entities:n}]}}:void 0}(e,n),c.push(...function(e,t,n){return[...Ss(e.presence,n?`${n} Presence`:"Presence"),...t.map(e=>({entity:e}))]}(n,Ei(e,t.deviceId),d?"LD2450":void 0))}var u,h;return l.history=function(e,t){if(0!==t.length)return{type:"history-graph",title:e,hours_to_show:24,entities:t}}(t.profile&&!t.ld2450?`${t.profile.label} Occupancy History`:"Occupancy History",Ms(e,c)),l.help=Hs(t,{gateDepth:Cs(o,s),gateSetup:!!l.gateSetup,ld2450Setup:!!l.ld2450Setup,gatePresence:r,gateRadar:a}),l.device=Xs(e,t,a),l}function Qs(e,t,n,i){const s=Ys(e,t,n,i),o=[];s.zoneMap&&(t.profile?o.push([s.zoneHeader,s.ld2450Setup,s.zoneMap],[s.zonePresence,s.ld2450Live,s.ld2450Controls,s.ld2450ControlsNote,s.builtInZones]):o.push([s.help,s.ld2450Setup,s.zoneMap],[s.zonePresence,s.ld2450Live,s.history],[s.ld2450Controls,s.ld2450ControlsNote,s.builtInZones]));const r=[];if(t.profile){const e=[s.help,s.gateSetup,s.calibrate,s.controls,s.zone,s.zoneNote],t=[s.distance,s.range,s.rangeNote];(s.zone?t:e).push(s.occupancy),r.push(e,...o,t,[s.gateEnergy,s.moveThr,s.gateNote],[s.history,s.stillThr])}else s.zoneMap?r.push(...o):r.push([s.help]);const a=r.map(e=>e.filter(Boolean)).filter(e=>e.length>0);return a[a.length-1].push(s.device),a.map(e=>({type:"grid",cards:e}))}function eo(e,t){const n=/* @__PURE__ */new Set;return Fs(e,t).map(i=>{let s=i.base;return n.has(s)&&(s=`${i.base}_${i.deviceId}`),n.add(s),function(e,t,n,i=t.base,s){return{title:t.name,path:i,type:"sections",sections:Qs(e,t,n,s)}}(e,i,t.distance_unit,s,t.calibration)})}function to(e,t){return Fs(e,t).flatMap(n=>Qs(e,n,t.distance_unit,t.calibration))}function no(e,t){return Fs(e,t).flatMap(n=>function(e,t,n,i){const s=Ys(e,t,n,i);return[s.help,s.gateSetup,s.calibrate,s.controls,s.range,s.rangeNote,s.zone,s.zoneNote,s.distance,s.gateEnergy,s.moveThr,s.stillThr,s.gateNote,s.occupancy,s.zoneHeader,s.ld2450Setup,s.zoneMap,s.zonePresence,s.ld2450Live,s.history,s.ld2450Controls,s.ld2450ControlsNote,s.builtInZones,s.device].filter(Boolean)}(e,n,t.distance_unit,t.calibration))}function io(e,t){return Fs(e,t).map(e=>{var t;return JSON.stringify([e.deviceId,(null===(t=e.profile)||void 0===t?void 0:t.key)??"",e.ld2450,e.online,e.name,e.base])}).sort().join(",")}function so(e,t,n){if(t.devices===n.devices&&t.entities===n.entities&&!function(e,t){for(const n in t.states){const i=t.states[n],s=e.states[n];if(s!==i&&Ls(s)!==Ls(i))return!0}return!1}(t,n))return!1;const i=function(e){const t=e.options;return 2===Object.keys(e).length&&"object"==typeof t&&null!==t}(e)?{...e,...e.options}:e;return io(t,i)!==io(n,i)}var oo={title:"Apollo Radar Tuning",cards:[{type:"markdown",content:"No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), R PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant."}]},ro={title:"Apollo Radar Tuning",cards:[{type:"markdown",content:"The dashboard's device selection points at devices that no longer exist in Home Assistant. Open Settings > Devices & Services > Apollo mmWave > Configure and clear or update Dashboard devices (leave it empty to show every Apollo mmWave device automatically)."}]},ao=class extends HTMLElement{static async generate(e,t){return{type:"sections",sections:to(t,e)}}};ao.shouldRegenerate=so;var lo=class extends HTMLElement{static async generate(e,t){var n;const i=eo(t,e),s=(null===(n=e.devices)||void 0===n?void 0:n.length)||e.device_id?ro:oo;return{title:"Apollo Radar Tuning",views:i.length?i:[s]}}};lo.shouldRegenerate=so;var co=class extends HTMLElement{static async generate(e,t){return{type:"grid",cards:no(t,e)}}};co.shouldRegenerate=so,rt("ll-strategy-view-apollo-radar-tuning",ao),rt("ll-strategy-section-apollo-radar-tuning",co),rt("ll-strategy-dashboard-apollo-radar-tuning",lo),window.customStrategies=window.customStrategies||[],window.customStrategies.some(e=>"apollo-radar-tuning"===e.type)||window.customStrategies.push({type:"apollo-radar-tuning",strategyType:"dashboard",name:"Apollo Radar Tuning",description:"Auto-built tuning dashboard for Apollo radar devices (MSR / LD2410, R PRO / LD2412 + LD2450, MTR-1 / LD2450).",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"});var uo="2.3.0";console.info(`%c APOLLO-MMWAVE %c v${uo} `,"color:#fff;background:#03a9f4;font-weight:700;","color:#03a9f4;background:#fff;font-weight:700;");export{uo as CARD_VERSION};