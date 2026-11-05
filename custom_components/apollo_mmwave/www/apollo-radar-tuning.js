var t,e="2.4.0",n=globalThis,i=n.ShadowRoot&&(void 0===n.ShadyCSS||n.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,s=Symbol(),o=/* @__PURE__ */new WeakMap,r=class{constructor(t,e,n){if(this._$cssResult$=!0,n!==s)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o;const e=this.t;if(i&&void 0===t){const n=void 0!==e&&1===e.length;n&&(t=o.get(e)),void 0===t&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),n&&o.set(e,t))}return t}toString(){return this.cssText}},a=(t,...e)=>{const n=1===t.length?t[0]:e.reduce((e,n,i)=>e+(t=>{if(!0===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+t[i+1],t[0]);return new r(n,t,s)},l=i?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const n of t.cssRules)e+=n.cssText;return(t=>new r("string"==typeof t?t:t+"",void 0,s))(e)})(t):t,{is:d,defineProperty:c,getOwnPropertyDescriptor:u,getOwnPropertyNames:h,getOwnPropertySymbols:_,getPrototypeOf:p}=Object,v=globalThis,f=v.trustedTypes,g=f?f.emptyScript:"",m=v.reactiveElementPolyfillSupport,y=(t,e)=>t,$={toAttribute(t,e){switch(e){case Boolean:t=t?g:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t)}return t},fromAttribute(t,e){let n=t;switch(e){case Boolean:n=null!==t;break;case Number:n=null===t?null:Number(t);break;case Object:case Array:try{n=JSON.parse(t)}catch(t){n=null}}return n}},b=(t,e)=>!d(t,e),w={attribute:!0,type:String,converter:$,reflect:!1,useDefault:!1,hasChanged:b};
/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/(t=Symbol).metadata??(t.metadata=Symbol("metadata")),v.litPropertyMetadata??(v.litPropertyMetadata=/* @__PURE__ */new WeakMap);var x=class extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??(this.l=[])).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=w){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){const n=Symbol(),i=this.getPropertyDescriptor(t,n,e);void 0!==i&&c(this.prototype,t,i)}}static getPropertyDescriptor(t,e,n){const{get:i,set:s}=u(this.prototype,t)??{get(){return this[e]},set(t){this[e]=t}};return{get:i,set(e){const o=null==i?void 0:i.call(this);null==s||s.call(this,e),this.requestUpdate(t,o,n)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??w}static _$Ei(){if(this.hasOwnProperty(y("elementProperties")))return;const t=p(this);t.finalize(),void 0!==t.l&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(y("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(y("properties"))){const t=this.properties,e=[...h(t),..._(t)];for(const n of e)this.createProperty(n,t[n])}const t=this[Symbol.metadata];if(null!==t){const e=litPropertyMetadata.get(t);if(void 0!==e)for(const[t,n]of e)this.elementProperties.set(t,n)}this._$Eh=/* @__PURE__ */new Map;for(const[e,n]of this.elementProperties){const t=this._$Eu(e,n);void 0!==t&&this._$Eh.set(t,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){const e=[];if(Array.isArray(t)){const n=new Set(t.flat(1/0).reverse());for(const t of n)e.unshift(l(t))}else void 0!==t&&e.push(l(t));return e}static _$Eu(t,e){const n=e.attribute;return!1===n?void 0:"string"==typeof n?n:"string"==typeof t?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var t;this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=/* @__PURE__ */new Map,this._$E_(),this.requestUpdate(),null===(t=this.constructor.l)||void 0===t||t.forEach(t=>t(this))}addController(t){var e;(this._$EO??(this._$EO=/* @__PURE__ */new Set)).add(t),void 0!==this.renderRoot&&this.isConnected&&(null===(e=t.hostConnected)||void 0===e||e.call(t))}removeController(t){var e;null===(e=this._$EO)||void 0===e||e.delete(t)}_$E_(){const t=/* @__PURE__ */new Map,e=this.constructor.elementProperties;for(const n of e.keys())this.hasOwnProperty(n)&&(t.set(n,this[n]),delete this[n]);t.size>0&&(this._$Ep=t)}createRenderRoot(){const t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((t,e)=>{if(i)t.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const i of e){const e=document.createElement("style"),s=n.litNonce;void 0!==s&&e.setAttribute("nonce",s),e.textContent=i.cssText,t.appendChild(e)}})(t,this.constructor.elementStyles),t}connectedCallback(){var t;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),null===(t=this._$EO)||void 0===t||t.forEach(t=>{var e;return null===(e=t.hostConnected)||void 0===e?void 0:e.call(t)})}enableUpdating(t){}disconnectedCallback(){var t;null===(t=this._$EO)||void 0===t||t.forEach(t=>{var e;return null===(e=t.hostDisconnected)||void 0===e?void 0:e.call(t)})}attributeChangedCallback(t,e,n){this._$AK(t,n)}_$ET(t,e){const n=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,n);if(void 0!==i&&!0===n.reflect){var s;const o=(void 0!==(null===(s=n.converter)||void 0===s?void 0:s.toAttribute)?n.converter:$).toAttribute(e,n.type);this._$Em=t,null==o?this.removeAttribute(i):this.setAttribute(i,o),this._$Em=null}}_$AK(t,e){const n=this.constructor,i=n._$Eh.get(t);if(void 0!==i&&this._$Em!==i){var s,o;const t=n.getPropertyOptions(i),r="function"==typeof t.converter?{fromAttribute:t.converter}:void 0!==(null===(s=t.converter)||void 0===s?void 0:s.fromAttribute)?t.converter:$;this._$Em=i;const a=r.fromAttribute(e,t.type);this[i]=a??(null===(o=this._$Ej)||void 0===o?void 0:o.get(i))??a,this._$Em=null}}requestUpdate(t,e,n,i=!1,s){if(void 0!==t){var o;const r=this.constructor;if(!1===i&&(s=this[t]),n??(n=r.getPropertyOptions(t)),!((n.hasChanged??b)(s,e)||n.useDefault&&n.reflect&&s===(null===(o=this._$Ej)||void 0===o?void 0:o.get(t))&&!this.hasAttribute(r._$Eu(t,n))))return;this.C(t,e,n)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(t,e,{useDefault:n,reflect:i,wrapped:s},o){n&&!(this._$Ej??(this._$Ej=/* @__PURE__ */new Map)).has(t)&&(this._$Ej.set(t,o??e??this[t]),!0!==s||void 0!==o)||(this._$AL.has(t)||(this.hasUpdated||n||(e=void 0),this._$AL.set(t,e)),!0===i&&this._$Em!==t&&(this._$Eq??(this._$Eq=/* @__PURE__ */new Set)).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[t,e]of this._$Ep)this[t]=e;this._$Ep=void 0}const t=this.constructor.elementProperties;if(t.size>0)for(const[e,n]of t){const{wrapped:t}=n,i=this[e];!0!==t||this._$AL.has(e)||void 0===i||this.C(e,void 0,n,i)}}let t=!1;const e=this._$AL;try{var n;t=this.shouldUpdate(e),t?(this.willUpdate(e),null===(n=this._$EO)||void 0===n||n.forEach(t=>{var e;return null===(e=t.hostUpdate)||void 0===e?void 0:e.call(t)}),this.update(e)):this._$EM()}catch(e){throw t=!1,this._$EM(),e}t&&this._$AE(e)}willUpdate(t){}_$AE(t){var e;null===(e=this._$EO)||void 0===e||e.forEach(t=>{var e;return null===(e=t.hostUpdated)||void 0===e?void 0:e.call(t)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=/* @__PURE__ */new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&(this._$Eq=this._$Eq.forEach(t=>this._$ET(t,this[t]))),this._$EM()}updated(t){}firstUpdated(t){}};x.elementStyles=[],x.shadowRootOptions={mode:"open"},x[y("elementProperties")]=/* @__PURE__ */new Map,x[y("finalized")]=/* @__PURE__ */new Map,null==m||m({ReactiveElement:x}),(v.reactiveElementVersions??(v.reactiveElementVersions=[])).push("2.1.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var k=globalThis,S=t=>t,T=k.trustedTypes,z=T?T.createPolicy("lit-html",{createHTML:t=>t}):void 0,R="$lit$",A=`lit$${Math.random().toFixed(9).slice(2)}$`,E="?"+A,C=`<${E}>`,M=document,I=()=>M.createComment(""),L=t=>null===t||"object"!=typeof t&&"function"!=typeof t,D=Array.isArray,P="[ \t\n\f\r]",O=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,F=/-->/g,N=/>/g,U=RegExp(`>|${P}(?:([^\\s"'>=/]+)(${P}*=${P}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),j=/'/g,B=/"/g,H=/^(?:script|style|textarea|title)$/i,Z=t=>(e,...n)=>({_$litType$:t,strings:e,values:n}),G=Z(1),W=Z(2),q=(Z(3),Symbol.for("lit-noChange")),J=Symbol.for("lit-nothing"),V=/* @__PURE__ */new WeakMap,K=M.createTreeWalker(M,129);function X(t,e){if(!D(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==z?z.createHTML(e):e}var Y=(t,e)=>{const n=t.length-1,i=[];let s,o=2===e?"<svg>":3===e?"<math>":"",r=O;for(let a=0;a<n;a++){const e=t[a];let n,l,d=-1,c=0;for(;c<e.length&&(r.lastIndex=c,l=r.exec(e),null!==l);)c=r.lastIndex,r===O?"!--"===l[1]?r=F:void 0!==l[1]?r=N:void 0!==l[2]?(H.test(l[2])&&(s=RegExp("</"+l[2],"g")),r=U):void 0!==l[3]&&(r=U):r===U?">"===l[0]?(r=s??O,d=-1):void 0===l[1]?d=-2:(d=r.lastIndex-l[2].length,n=l[1],r=void 0===l[3]?U:'"'===l[3]?B:j):r===B||r===j?r=U:r===F||r===N?r=O:(r=U,s=void 0);const u=r===U&&t[a+1].startsWith("/>")?" ":"";o+=r===O?e+C:d>=0?(i.push(n),e.slice(0,d)+R+e.slice(d)+A+u):e+A+(-2===d?a:u)}return[X(t,o+(t[n]||"<?>")+(2===e?"</svg>":3===e?"</math>":"")),i]},Q=class t{constructor({strings:e,_$litType$:n},i){let s;this.parts=[];let o=0,r=0;const a=e.length-1,l=this.parts,[d,c]=Y(e,n);if(this.el=t.createElement(d,i),K.currentNode=this.el.content,2===n||3===n){const t=this.el.content.firstChild;t.replaceWith(...t.childNodes)}for(;null!==(s=K.nextNode())&&l.length<a;){if(1===s.nodeType){if(s.hasAttributes())for(const t of s.getAttributeNames())if(t.endsWith(R)){const e=c[r++],n=s.getAttribute(t).split(A),i=/([.?@])?(.*)/.exec(e);l.push({type:1,index:o,name:i[2],strings:n,ctor:"."===i[1]?st:"?"===i[1]?ot:"@"===i[1]?rt:it}),s.removeAttribute(t)}else t.startsWith(A)&&(l.push({type:6,index:o}),s.removeAttribute(t));if(H.test(s.tagName)){const t=s.textContent.split(A),e=t.length-1;if(e>0){s.textContent=T?T.emptyScript:"";for(let n=0;n<e;n++)s.append(t[n],I()),K.nextNode(),l.push({type:2,index:++o});s.append(t[e],I())}}}else if(8===s.nodeType)if(s.data===E)l.push({type:2,index:o});else{let t=-1;for(;-1!==(t=s.data.indexOf(A,t+1));)l.push({type:7,index:o}),t+=A.length-1}o++}}static createElement(t,e){const n=M.createElement("template");return n.innerHTML=t,n}};function tt(t,e,n=t,i){var s,o;if(e===q)return e;let r=void 0!==i?null===(s=n._$Co)||void 0===s?void 0:s[i]:n._$Cl;const a=L(e)?void 0:e._$litDirective$;return(null==r?void 0:r.constructor)!==a&&(null==r||null===(o=r._$AO)||void 0===o||o.call(r,!1),void 0===a?r=void 0:(r=new a(t),r._$AT(t,n,i)),void 0!==i?(n._$Co??(n._$Co=[]))[i]=r:n._$Cl=r),void 0!==r&&(e=tt(t,r._$AS(t,e.values),r,i)),e}var et=class{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:e},parts:n}=this._$AD,i=((null==t?void 0:t.creationScope)??M).importNode(e,!0);K.currentNode=i;let s=K.nextNode(),o=0,r=0,a=n[0];for(;void 0!==a;){if(o===a.index){let e;2===a.type?e=new nt(s,s.nextSibling,this,t):1===a.type?e=new a.ctor(s,a.name,a.strings,this,t):6===a.type&&(e=new at(s,this,t)),this._$AV.push(e),a=n[++r]}o!==(null==a?void 0:a.index)&&(s=K.nextNode(),o++)}return K.currentNode=M,i}p(t){let e=0;for(const n of this._$AV)void 0!==n&&(void 0!==n.strings?(n._$AI(t,n,e),e+=n.strings.length-2):n._$AI(t[e])),e++}},nt=class t{get _$AU(){var t;return(null===(t=this._$AM)||void 0===t?void 0:t._$AU)??this._$Cv}constructor(t,e,n,i){this.type=2,this._$AH=J,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=n,this.options=i,this._$Cv=(null==i?void 0:i.isConnected)??!0}get parentNode(){let t=this._$AA.parentNode;const e=this._$AM;return void 0!==e&&11===(null==t?void 0:t.nodeType)&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=tt(this,t,e),L(t)?t===J||null==t||""===t?(this._$AH!==J&&this._$AR(),this._$AH=J):t!==this._$AH&&t!==q&&this._(t):void 0!==t._$litType$?this.$(t):void 0!==t.nodeType?this.T(t):(t=>D(t)||"function"==typeof(null==t?void 0:t[Symbol.iterator]))(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==J&&L(this._$AH)?this._$AA.nextSibling.data=t:this.T(M.createTextNode(t)),this._$AH=t}$(t){var e;const{values:n,_$litType$:i}=t,s="number"==typeof i?this._$AC(t):(void 0===i.el&&(i.el=Q.createElement(X(i.h,i.h[0]),this.options)),i);if((null===(e=this._$AH)||void 0===e?void 0:e._$AD)===s)this._$AH.p(n);else{const t=new et(s,this),e=t.u(this.options);t.p(n),this.T(e),this._$AH=t}}_$AC(t){let e=V.get(t.strings);return void 0===e&&V.set(t.strings,e=new Q(t)),e}k(e){D(this._$AH)||(this._$AH=[],this._$AR());const n=this._$AH;let i,s=0;for(const o of e)s===n.length?n.push(i=new t(this.O(I()),this.O(I()),this,this.options)):i=n[s],i._$AI(o),s++;s<n.length&&(this._$AR(i&&i._$AB.nextSibling,s),n.length=s)}_$AR(t=this._$AA.nextSibling,e){var n;for(null===(n=this._$AP)||void 0===n||n.call(this,!1,!0,e);t!==this._$AB;){const e=S(t).nextSibling;S(t).remove(),t=e}}setConnected(t){var e;void 0===this._$AM&&(this._$Cv=t,null===(e=this._$AP)||void 0===e||e.call(this,t))}},it=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,n,i,s){this.type=1,this._$AH=J,this._$AN=void 0,this.element=t,this.name=e,this._$AM=i,this.options=s,n.length>2||""!==n[0]||""!==n[1]?(this._$AH=Array(n.length-1).fill(/* @__PURE__ */new String),this.strings=n):this._$AH=J}_$AI(t,e=this,n,i){const s=this.strings;let o=!1;if(void 0===s)t=tt(this,t,e,0),o=!L(t)||t!==this._$AH&&t!==q,o&&(this._$AH=t);else{const i=t;let r,a;for(t=s[0],r=0;r<s.length-1;r++)a=tt(this,i[n+r],e,r),a===q&&(a=this._$AH[r]),o||(o=!L(a)||a!==this._$AH[r]),a===J?t=J:t!==J&&(t+=(a??"")+s[r+1]),this._$AH[r]=a}o&&!i&&this.j(t)}j(t){t===J?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},st=class extends it{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===J?void 0:t}},ot=class extends it{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==J)}},rt=class extends it{constructor(t,e,n,i,s){super(t,e,n,i,s),this.type=5}_$AI(t,e=this){if((t=tt(this,t,e,0)??J)===q)return;const n=this._$AH,i=t===J&&n!==J||t.capture!==n.capture||t.once!==n.once||t.passive!==n.passive,s=t!==J&&(n===J||i);i&&this.element.removeEventListener(this.name,this,n),s&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){var e;"function"==typeof this._$AH?this._$AH.call((null===(e=this.options)||void 0===e?void 0:e.host)??this.element,t):this._$AH.handleEvent(t)}},at=class{constructor(t,e,n){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=n}get _$AU(){return this._$AM._$AU}_$AI(t){tt(this,t)}},lt=k.litHtmlPolyfillSupport;null==lt||lt(Q,nt),(k.litHtmlVersions??(k.litHtmlVersions=[])).push("3.3.3");var dt,ct=globalThis,ut=class extends x{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(t){const e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=((t,e,n)=>{const i=(null==n?void 0:n.renderBefore)??e;let s=i._$litPart$;if(void 0===s){const t=(null==n?void 0:n.renderBefore)??null;i._$litPart$=s=new nt(e.insertBefore(I(),t),t,void 0,n??{})}return s._$AI(t),s})(e,this.renderRoot,this.renderOptions)}connectedCallback(){var t;super.connectedCallback(),null===(t=this._$Do)||void 0===t||t.setConnected(!0)}disconnectedCallback(){var t;super.disconnectedCallback(),null===(t=this._$Do)||void 0===t||t.setConnected(!1)}render(){return q}};ut._$litElement$=!0,ut.finalized=!0,null===(dt=ct.litElementHydrateSupport)||void 0===dt||dt.call(ct,{LitElement:ut});var ht=ct.litElementPolyfillSupport;null==ht||ht({LitElement:ut}),(ct.litElementVersions??(ct.litElementVersions=[])).push("4.2.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var _t={attribute:!0,type:String,converter:$,reflect:!1,hasChanged:b},pt=(t=_t,e,n)=>{const{kind:i,metadata:s}=n;let o=globalThis.litPropertyMetadata.get(s);if(void 0===o&&globalThis.litPropertyMetadata.set(s,o=/* @__PURE__ */new Map),"setter"===i&&((t=Object.create(t)).wrapped=!0),o.set(n.name,t),"accessor"===i){const{name:i}=n;return{set(n){const s=e.get.call(this);e.set.call(this,n),this.requestUpdate(i,s,t,!0,n)},init(e){return void 0!==e&&this.C(i,void 0,t,e),e}}}if("setter"===i){const{name:i}=n;return function(n){const s=this[i];e.call(this,n),this.requestUpdate(i,s,t,!0,n)}}throw Error("Unsupported decorator location: "+i)};function vt(t){return(e,n)=>"object"==typeof n?pt(t,e,n):((t,e,n)=>{const i=e.hasOwnProperty(n);return e.constructor.createProperty(n,t),i?Object.getOwnPropertyDescriptor(e,n):void 0})(t,e,n)}
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/function ft(t){return vt({...t,state:!0,attribute:!1})}var gt=[],mt=/* @__PURE__ */new WeakMap;function yt(t,e){return function(t){let e=mt.get(t);if(!e){e=/* @__PURE__ */new Map;for(const[n,i]of Object.entries(t)){const t=e.get(i.device_id);t?t.push([n,i]):e.set(i.device_id,[[n,i]])}mt.set(t,e)}return e}(t).get(e)??gt}function $t(t){return`${t}: the configured detection-range limit, shown as a gate number.`}var bt="💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values. The sliders start locked, so a scroll cannot move them. Press **Unlock** above them to change one. Or press **Calibrate with empty room** on the Auto-calibrate card to set them from your empty room.";function wt(t){return`**Radar Timeout** is how long ${t} stays on after the radar last detects someone; raise it if lights turn off while you sit still.`}function xt(t){return`Each gate is ${t} deep.`}var kt={move:[50,50,40,30,20,15,15,15,15],still:[0,0,40,40,30,30,20,20,20]},St={key:"ld2410",label:"LD2410",maxBarLabels:["Max Move","Max Still"],rangeLabels:["Max Move Gate","Max Still Gate"],gateSizeLabel:"Gate Size",rangeTip:t=>`💡 **Max Move / Still Gate** cap the farthest gate used to detect moving vs. still targets; lower them to ignore distant motion. ${xt(t)} `+wt("**Radar Target**"),gateTip:bt,wikiUrl:"https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/",entityMap(t){const e=[0,1,2,3,4,5,6,7,8],n=t=>e.map(e=>t(e));return{engineering_mode:`switch.${t}_radar_engineering_mode`,bluetooth:`switch.${t}_ld2410_bluetooth`,restart_radar:`button.${t}_restart_radar`,factory_reset_radar:`button.${t}_factory_reset_radar`,esp_reboot:`button.${t}_esp_reboot`,query_params:`button.${t}_query_params`,radar_timeout:`number.${t}_radar_timeout`,zone_1_start:`number.${t}_radar_zone_1_start`,end_zone_1:`number.${t}_radar_end_zone_1`,end_zone_2:`number.${t}_radar_end_zone_2`,end_zone_3:`number.${t}_radar_end_zone_3`,max_move_distance:`number.${t}_radar_max_move_distance`,max_still_distance:`number.${t}_radar_max_still_distance`,gate_size:`select.${t}_ld2410_gate_size`,move_threshold:n(e=>`number.${t}_g${e}_move_threshold`),still_threshold:n(e=>`number.${t}_g${e}_still_threshold`),move_energy:n(e=>`sensor.${t}_g${e}_move_energy`),still_energy:n(e=>`sensor.${t}_g${e}_still_energy`),still_distance:`sensor.${t}_radar_still_distance`,moving_distance:`sensor.${t}_radar_moving_distance`,detection_distance:`sensor.${t}_radar_detection_distance`,radar_target:`binary_sensor.${t}_radar_target`,moving_target:`binary_sensor.${t}_radar_moving_target`,still_target:`binary_sensor.${t}_radar_still_target`,zone_1_occupancy:`binary_sensor.${t}_radar_zone_1_occupancy`,zone_2_occupancy:`binary_sensor.${t}_radar_zone_2_occupancy`,zone_3_occupancy:`binary_sensor.${t}_radar_zone_3_occupancy`,zone_occupancy:`binary_sensor.${t}_radar_zone_occupancy`}}},Tt={key:"ld2412",label:"LD2412",maxBarLabels:["Max Gate","Min Gate"],maxBarTips:[$t("Max Gate"),"Min Gate: gates below this one are ignored for detection."],rangeLabels:["Max Gate","Min Gate"],gateSizeLabel:"Distance Resolution",rangeTip:t=>`💡 **Max Gate** is the farthest gate the radar uses and **Min Gate** the nearest; raise Min Gate to ignore anything right next to the sensor. ${xt(t)} `+wt("**LD2412 Presence** (Radar Target)"),gateTip:bt,wikiUrl:"https://wiki.apolloautomation.com/products/rpro1/setup/apollo-mmwave-dashboard/#r-pro-1-and-its-ld2412-radar",entityMap(t){const e=Array.from({length:14},(t,e)=>e),n=t=>e.map(e=>t((t=>String(t).padStart(2,"0"))(e)));return{engineering_mode:`switch.${t}_ld2412_engineering_mode`,bluetooth:`switch.${t}_ld2412_bluetooth`,restart_radar:`button.${t}_ld2412_restart`,factory_reset_radar:`button.${t}_ld2412_factory_reset`,esp_reboot:`button.${t}_esp_reboot`,radar_timeout:`number.${t}_ld2412_timeout`,zone_1_start:void 0,end_zone_1:void 0,end_zone_2:void 0,end_zone_3:void 0,zone_1_occupancy:void 0,zone_2_occupancy:void 0,zone_3_occupancy:void 0,zone_occupancy:void 0,max_move_distance:`number.${t}_ld2412_max_distance_gate`,max_still_distance:`number.${t}_ld2412_min_distance_gate`,gate_size:`select.${t}_ld2412_distance_resolution`,move_threshold:n(e=>`number.${t}_ld2412_g${e}_move_threshold`),still_threshold:n(e=>`number.${t}_ld2412_g${e}_still_threshold`),move_energy:n(e=>`sensor.${t}_ld2412_g${e}_move_energy`),still_energy:n(e=>`sensor.${t}_ld2412_g${e}_still_energy`),still_distance:void 0,moving_distance:void 0,detection_distance:void 0,radar_target:`binary_sensor.${t}_ld2412_presence`,moving_target:`binary_sensor.${t}_ld2412_moving_target`,still_target:`binary_sensor.${t}_ld2412_still_target`,background_correction:`button.${t}_ld2412_start_dynamic_background_correction`,background_correction_status:`binary_sensor.${t}_ld2412_dynamic_background_correction_status`,query_params:`button.${t}_ld2412_query_params`}}},zt=[Tt,St],Rt=[{prefix:"msr-1",profile:St,ld2450:!1},{prefix:"msr-2",profile:St,ld2450:!1},{prefix:"mtr-1",ld2450:!0},{prefix:"r-pro-1",profile:Tt,ld2450:!0}];function At(t){if(!(null==t?void 0:t.manufacturer)||!t.model)return;if("apolloautomation"!==t.manufacturer.toLowerCase())return;const e=t.model.toLowerCase(),n=Rt.find(t=>e.startsWith(t.prefix));return n?{profile:n.profile,ld2450:n.ld2450}:void 0}function Et(t,e){for(const n of zt){const i=n.entityMap(e).engineering_mode;if(i&&i in t.states)return n}}var Ct=[/_ld2412_(?!.*ld2412_).+$/,/_ld2450_(?!.*ld2450_).+$/,/_target_\d+_[xy](?:_\d+)?$/,/_radar_engineering_mode(?:_\d+)?$/,/_ld2410_bluetooth(?:_\d+)?$/,/_radar_control_bluetooth(?:_\d+)?$/,/_radar_distance_resolution(?:_\d+)?$/,/_restart_radar(?:_\d+)?$/,/_factory_reset_radar(?:_\d+)?$/,/_esp_reboot(?:_\d+)?$/,/_radar_timeout(?:_\d+)?$/,/_radar_zone_\d+_start(?:_\d+)?$/,/_radar_end_zone_\d+(?:_\d+)?$/,/_radar_max_move_distance(?:_\d+)?$/,/_radar_max_still_distance(?:_\d+)?$/,/_ld2410_gate_size(?:_\d+)?$/,/_g\d+_move_threshold(?:_\d+)?$/,/_g\d+_still_threshold(?:_\d+)?$/,/_g\d+_move_energy(?:_\d+)?$/,/_g\d+_still_energy(?:_\d+)?$/,/_radar_still_distance(?:_\d+)?$/,/_radar_moving_distance(?:_\d+)?$/,/_radar_detection_distance(?:_\d+)?$/,/_radar_moving_target(?:_\d+)?$/,/_radar_still_target(?:_\d+)?$/,/_radar_target(?:_\d+)?$/,/_radar_zone_\d+_occupancy(?:_\d+)?$/];function Mt(t){for(const e of Ct)if(e.test(t))return t.replace(e,"")}function It(t,e){const n=yt(t.entities,e).map(([t])=>t.slice(t.indexOf(".")+1)),i=/* @__PURE__ */new Map;for(const r of n){const t=Mt(r);t&&i.set(t,(i.get(t)??0)+1)}let s,o=0;for(const[r,a]of i)a>o&&(s=r,o=a);return s}var Lt=["move_threshold","still_threshold","move_energy","still_energy"],Dt="(?:_\\d+)?$",Pt=(t,e,n)=>({slot:t,domain:e,re:new RegExp(n+Dt)}),Ot=[Pt("engineering_mode","switch","_radar_engineering_mode"),Pt("bluetooth","switch","_ld2410_bluetooth"),Pt("bluetooth","switch","_radar_control_bluetooth"),Pt("gate_size","select","_radar_distance_resolution"),Pt("restart_radar","button","_restart_radar"),Pt("factory_reset_radar","button","_factory_reset_radar"),Pt("esp_reboot","button","_esp_reboot"),Pt("query_params","button","_query_params"),Pt("radar_timeout","number","_radar_timeout"),Pt("zone_1_start","number","_radar_zone_1_start"),Pt("end_zone_1","number","_radar_end_zone_1"),Pt("end_zone_2","number","_radar_end_zone_2"),Pt("end_zone_3","number","_radar_end_zone_3"),Pt("max_move_distance","number","_radar_max_move_distance"),Pt("max_still_distance","number","_radar_max_still_distance"),Pt("gate_size","select","_ld2410_gate_size"),Pt("still_distance","sensor","_radar_still_distance"),Pt("moving_distance","sensor","_radar_moving_distance"),Pt("detection_distance","sensor","_radar_detection_distance"),Pt("moving_target","binary_sensor","_radar_moving_target"),Pt("still_target","binary_sensor","_radar_still_target"),Pt("radar_target","binary_sensor","_radar_target"),Pt("zone_1_occupancy","binary_sensor","_radar_zone_1_occupancy"),Pt("zone_2_occupancy","binary_sensor","_radar_zone_2_occupancy"),Pt("zone_3_occupancy","binary_sensor","_radar_zone_3_occupancy"),Pt("zone_occupancy","binary_sensor","_radar_zone_occupancy"),Pt("engineering_mode","switch","_ld2412_engineering_mode"),Pt("bluetooth","switch","_ld2412_bluetooth"),Pt("restart_radar","button","_ld2412_restart"),Pt("factory_reset_radar","button","_ld2412_factory_reset"),Pt("radar_timeout","number","_ld2412_timeout"),Pt("max_move_distance","number","_ld2412_max_distance_gate"),Pt("max_still_distance","number","_ld2412_min_distance_gate"),Pt("gate_size","select","_ld2412_distance_resolution"),Pt("radar_target","binary_sensor","_ld2412_presence"),Pt("moving_target","binary_sensor","_ld2412_moving_target"),Pt("still_target","binary_sensor","_ld2412_still_target"),Pt("background_correction","button","_ld2412_start_dynamic_background_correction"),Pt("background_correction_status","binary_sensor","_ld2412_dynamic_background_correction_status"),Pt("query_params","button","_ld2412_query_params")],Ft=[["move_threshold","number"],["still_threshold","number"],["move_energy","sensor"],["still_energy","sensor"]].map(([t,e])=>({slot:t,domain:e,re:new RegExp(`_g(\\d+)_${t}${Dt}`)}));function Nt(t,e){for(const n of Ft){const i=n.re.exec(e);if(i)return t===n.domain?{slot:n.slot,gate:parseInt(i[1],10)}:void 0}for(const n of Ot)if(n.re.test(e))return t===n.domain?{slot:n.slot}:void 0}var Ut=[/_ld2410_/,new RegExp(`_radar_engineering_mode${Dt}`),new RegExp(`_g\\d+_(?:move|still)_(?:threshold|energy)${Dt}`),new RegExp(`_radar_max_(?:move|still)_distance${Dt}`)];function jt(t,e){let n=!1;for(const[i]of yt(t.entities,e)){const t=i.slice(i.indexOf(".")+1);if(/_ld2412_/.test(t))return Tt;n||(n=Ut.some(e=>e.test(t)))}return n?St:void 0}function Bt(t,e){const n={move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]};let i=!1;for(const[s]of yt(t.entities,e)){const t=s.indexOf("."),e=Nt(s.slice(0,t),s.slice(t+1));if(e)if("gate"in e){const t=n[e.slot];void 0===t[e.gate]&&(t[e.gate]=s,i=!0)}else void 0===n[e.slot]&&(n[e.slot]=s,i=!0)}return i?n:void 0}function Ht(t,e){let n;return e.device_id&&(n=It(t,e.device_id)),!n&&e.device_base_name&&(n=e.device_base_name),n}function Zt(t,e){if(e.device_id){const n=jt(t,e.device_id);if(n)return n;const i=At(t.devices[e.device_id]);if(i)return i.profile}const n=Ht(t,e);if(n)return Et(t,n)??St}function Gt(t,e){let n,i;if(e.device_id&&(n=Bt(t,e.device_id)),!n){i=Ht(t,e);const s=i?Zt(t,e)??St:void 0;n=i&&s?s.entityMap(i):{move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]}}const s=e.entities?function(t,e){const n={...t,...e};for(const i of Lt)Array.isArray(n[i])||(n[i]=t[i]);return n}(n,e.entities):n;return i?{map:s,fallbackBase:i}:{map:s}}function Wt(t,e){return!!e&&e in t.states}var qt=[{slot:"apollo_firmware",domain:"sensor",re:new RegExp(`_apollo_firmware_version${Dt}`)},{slot:"ld2410_firmware",domain:"sensor",re:new RegExp(`_radar_firmware_version${Dt}`)},{slot:"ld2412_firmware",domain:"sensor",re:new RegExp(`_ld2412_firmware${Dt}`)},{slot:"ld2450_firmware",domain:"sensor",re:new RegExp(`_ld2450_firmware${Dt}`)},{slot:"update",domain:"update",re:new RegExp(`_firmware_update${Dt}`)},{slot:"rssi",domain:"sensor",re:new RegExp(`_rssi${Dt}`)},{slot:"esp_reboot",domain:"button",re:new RegExp(`_esp_reboot${Dt}`)}];function Jt(t,e){if("string"==typeof e)t.push(e);else if(Array.isArray(e))for(const n of e)n&&t.push(n)}function Vt(t){const e=[];for(const n of Object.values(t))Jt(e,n);return e}function Kt(t,e){const n=[];for(const i of e)Jt(n,t[i]);return n}function Xt(t,e,n){return(null==t?void 0:t.resolved)===e?t:{resolved:e,ids:Kt(e.map,n)}}function Yt(t){return Vt(t).filter(e=>e!==t.esp_reboot)}function Qt(t,e,n){if(t&&t.config===n&&t.entities===e.entities&&t.devices===e.devices&&(void 0===t.fallbackBase||Et(e,t.fallbackBase)===t.fallbackDetected))return t;const{map:i,fallbackBase:s}=Gt(e,n);return{config:n,entities:e.entities,devices:e.devices,map:i,profile:Zt(e,n),ids:Vt(i),radarIds:Yt(i),fallbackBase:s,fallbackDetected:void 0===s?void 0:Et(e,s)}}function te(t,e,n){return n.some(n=>t.states[n]!==e.states[n])}function ee(t,e,n,i,s){if(i!==n)return te(t,e,i.ids);const{radarIds:o}=i;return ne(t,o)!==ne(e,o)||te(t,e,s)}function ne(t,e){return e.some(e=>e in t.states)}var ie=/* @__PURE__ */new Map,se=!1;function oe(t,e){try{window.customElements.get(t)||window.customElements.define(t,e)}catch{}}function re(){for(const[t,e]of ie)oe(t,e)}function ae(t,e){if(ie.set(t,e),oe(t,e),!se){se=!0;for(const t of["home-assistant","hc-main"])window.customElements.whenDefined(t).then(re,()=>{})}}function le(t,e,n){const i=window.customCards=window.customCards||[];i.some(e=>e.type===t)||i.push({type:t,name:e,description:n,documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"})}var de=["mm","cm","m","in","ft","yd"],ce={mm:.001,cm:.01,m:1,in:.0254,ft:.3048,yd:.9144};function ue(t){return!!t&&de.includes(t)}function he(t,e,n){return e===n?t:function(t,e){return t*ce[e]}(t,e)/ce[n]}function _e(t,e){if(!e)return;const n=t.states[e];if(!n)return;const i=parseFloat(n.state);return Number.isFinite(i)?i:void 0}function pe(t,e,n){var i;const s=e?null===(i=t.states[e])||void 0===i||null===(i=i.attributes)||void 0===i?void 0:i.unit_of_measurement:void 0;return ue(s)?s:n}function ve(t){if(!t)return;const e=t.replace(",",".").match(/[0-9]*\.?[0-9]+/);if(!e)return;const n=parseFloat(e[0]);return Number.isFinite(n)?n:void 0}function fe(t,e,n){return e<=0?0:function(t,e,n){return Math.max(e,Math.min(n,t))}(t/e*n,0,n)}function ge(t){return Math.max(t.move_threshold.length,t.still_threshold.length,t.move_energy.length,t.still_energy.length)}var me="#2e7d32",ye="#6a1b9a",$e=["#d32f2f","#1565c0","#2e7d32"];function be(t,e){return`hsl(${220-220*t/Math.max(1,e-1)}, 64%, 48%)`}var we="var(--secondary-text-color, #9aa0a6)";function xe(t,e,n){const i=_e(t,e);if(void 0!==i)return he(i,pe(t,e,n),n)}var ke=["gate_size","detection_distance","moving_distance","still_distance","radar_target","moving_target","still_target","zone_1_start","end_zone_1","end_zone_2","end_zone_3","zone_1_occupancy","zone_2_occupancy","zone_3_occupancy","max_move_distance","max_still_distance"];var Se=64,Te=22,ze=15;function Re(t,e,n,i=St.maxBarLabels,s="LD2410",o){if(0===e.move_threshold.length)return J;const r=function(t,e,n){var i;const s=he(ve(e.gate_size?null===(i=t.states[e.gate_size])||void 0===i?void 0:i.state:void 0)??.75,"m",n),o=ge(e),r=o>1?o-1:8,a=s*r,l=[],d=(e,i,s,o)=>{var r,a,d;if(!e||!(e in t.states))return;const c=!!i&&"off"===(null===(r=t.states[i])||void 0===r?void 0:r.state),u=c?void 0:xe(t,e,n),h=!!i&&"on"===(null===(a=t.states[i])||void 0===a?void 0:a.state)&&"unknown"===(null===(d=t.states[e])||void 0===d?void 0:d.state);l.push({label:s,value:u??0,color:o,noTarget:c,unreported:h})};d(e.detection_distance,e.radar_target,"Detection","#b71c1c"),d(e.moving_distance,e.moving_target,"Moving",ye),d(e.still_distance,e.still_target,"Still",me);const c=[],u=[xe(t,e.zone_1_start,n),xe(t,e.end_zone_1,n),xe(t,e.end_zone_2,n),xe(t,e.end_zone_3,n)],h=[e.zone_1_occupancy,e.zone_2_occupancy,e.zone_3_occupancy];for(let f=0;f<3;f++){var _;const e=u[f],n=u[f+1];if(void 0===e||void 0===n)continue;const i=h[f];c.push({label:`Zone ${f+1}`,start:e,end:n,color:$e[f],occupied:!!i&&"on"===(null===(_=t.states[i])||void 0===_?void 0:_.state)})}const p=_e(t,e.max_still_distance),v=_e(t,e.max_move_distance);return{unit:n,gateSizeChart:s,gateCount:r,maxRange:a,bars:l,zones:c,maxStill:void 0===p?void 0:p*s,maxMove:void 0===v?void 0:v*s,maxStillGate:p,maxMoveGate:v}}(t,e,n),a=t=>Se+fe(t,r.maxRange,402),l=[];r.zones.length&&l.push({kind:"zones"});for(const p of r.bars)l.push({kind:"bar",bar:p});l.push({kind:"gates"}),void 0!==r.maxMove&&void 0!==r.maxMoveGate&&l.push({kind:"max",label:i[0],value:r.maxMove,gate:r.maxMoveGate,tip:null==o?void 0:o[0],color:ye}),void 0!==r.maxStill&&void 0!==r.maxStillGate&&l.push({kind:"max",label:i[1],value:r.maxStill,gate:r.maxStillGate,tip:null==o?void 0:o[1],color:me});const d=6+30*l.length,c=d+52,u=t=>r.gateSizeChart>=10?t.toFixed(0):String(Number(t.toFixed(2))),h=[];for(let p=0;p<=r.gateCount;p++){const t=a(r.gateSizeChart*p),e=r.gateSizeChart*p;h.push(W`
      <line x1=${t} y1=${6} x2=${t} y2=${d}
        stroke="var(--divider-color, #555)" stroke-width="1" opacity="0.3"></line>
      <text x=${t} y=${d+13} font-size="11" text-anchor="end"
        transform="rotate(-45 ${t} ${d+13})" fill=${we}>${u(e)} ${n}</text>`)}const _=l.map((t,e)=>{const i=6+30*e,s=W`<text x=${58} y=${i+ze} font-size="12"
      text-anchor="end" fill=${we}>${function(t){return"zones"===t.kind?"Zones":"gates"===t.kind?"Gates":"bar"===t.kind?t.bar.label:t.label}(t)}</text>`;let o;if("zones"===t.kind)o=r.zones.map((t,e)=>{const n=a(t.start),s=a(t.end),o=s-n,r=o>=40;return W`
          <rect x=${n} y=${i} width=${Math.max(1,o)} height=${Te}
            rx="4" fill=${t.color} opacity=${t.occupied?.95:.6}></rect>
          ${r?W`<text x=${n+6} y=${i+ze} font-size="13" font-weight="600"
                fill="#fff">Z${e+1}</text>`:J}
          <circle cx=${s-11} cy=${i+11} r="5"
            fill=${t.occupied?"#fff":"none"} stroke="#fff" stroke-width="2"></circle>`});else if("bar"===t.kind){const e=a(t.bar.value),s=t.bar.noTarget?"no target":t.bar.unreported?"distance unknown":(t=>`${t.toFixed(1)} ${n}`)(t.bar.value);o=W`
        <rect x=${Se} y=${i} width=${Math.max(1,e-Se)} height=${Te}
          rx="4" fill=${t.bar.color}></rect>
        ${function(t,e,n){return t>296.36?W`<text x=${t-6} y=${n+ze} font-size="13" text-anchor="end" fill="#fff">${e}</text>`:W`<text x=${t+6} y=${n+ze} font-size="13" fill=${"var(--primary-text-color, #e6e6e6)"}>${e}</text>`}(e,s,i)}`}else if("gates"===t.kind){const t=[];for(let e=0;e<r.gateCount;e++){const n=a(r.gateSizeChart*e),s=a(r.gateSizeChart*(e+1));t.push(W`
          <rect x=${n} y=${i} width=${Math.max(1,s-n)} height=${Te}
            fill=${be(e,r.gateCount)}></rect>
          <text x=${(n+s)/2} y=${i+ze} font-size="12" font-weight="600"
            text-anchor="middle" fill="#fff">G${e+1}</text>`)}o=t}else{const e=a(t.value),n=`G${t.gate}`;o=W`
        <rect x=${Se} y=${i} width=${Math.max(1,e-Se)} height=${Te}
          rx="4" fill=${t.color} opacity="0.6"></rect>
        <text x=${(Se+e)/2} y=${i+ze} font-size="13" font-weight="600"
          text-anchor="middle" fill="#fff">${n}</text>`}const l="bar"===t.kind&&t.bar.noTarget?W`<g opacity=${.45}>${s}${o}</g>`:W`${s}${o}`;return W`<g>
      <title>${function(t){if("zones"===t.kind)return"Detection zones. The circle shows whether a target is currently in each zone (filled = present).";if("gates"===t.kind)return"The radar splits its range into gates. Each colored segment is one distance bin (G1, G2, ...).";if("max"===t.kind)return t.tip??$t(t.label);const e="Detection"===(n=t.bar.label)?"Current distance to the detected target.":"Moving"===n?"Current distance to a moving target.":"Current distance to a still (stationary) target.";var n;return t.bar.noTarget?`${e} The radar reports no target right now.`:t.bar.unreported?`${e} The radar reports a target, but its distance reads unknown.`:e}(t)}</title>
      <rect x="0" y=${i} width=${478} height=${Te} fill="transparent"></rect>
      ${l}
    </g>`});return G`
    <svg viewBox="0 0 ${478} ${c}" width="100%" role="img"
      aria-label="${s} distances">
      ${h} ${_}
    </svg>
  `}function Ae(t,e,n,i){var s,o=arguments.length,r=o<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,n):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(t,e,n,i);else for(var a=t.length-1;a>=0;a--)(s=t[a])&&(r=(o<3?s(r):o>3?s(e,n,r):s(e,n))||r);return o>3&&r&&Object.defineProperty(e,n,r),r}var Ee=class extends ut{setConfig(t){this._config=t}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-distance-card"}}shouldUpdate(t){if(!t.has("hass")||t.has("_config"))return!0;const e=t.get("hass");if(!e||!this.hass||!this._config)return!0;if(e.entities!==this.hass.entities||e.devices!==this.hass.devices||e.config!==this.hass.config)return!0;const n=this._resolved;return this._resolved=Qt(n,this.hass,this._config),this._watched=Xt(this._watched,this._resolved,ke),ee(e,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return J;this._resolved=Qt(this._resolved,this.hass,this._config);const{map:t,profile:e,radarIds:n}=this._resolved;if(!ne(this.hass,n))return this._renderNotFound();const i=ue(this._config.distance_unit)?this._config.distance_unit:"mi"===(null==(s=this.hass)||null===(o=s.config)||void 0===o||null===(o=o.unit_system)||void 0===o?void 0:o.length)?"in":"m";var s,o;const r=(null==e?void 0:e.label)??"LD2410",a=Re(this.hass,t,i,null==e?void 0:e.maxBarLabels,r,null==e?void 0:e.maxBarTips);return a===J?J:G`
      <ha-card .header=${this._config.title??`${r} Distances`}>
        <div class="wrap">${a}</div>
      </ha-card>
    `}_renderNotFound(){var t,e;const n=(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.label)??"LD2410";return G`
      <ha-card .header=${(null===(e=this._config)||void 0===e?void 0:e.title)??`${n} Distances`}>
        <div class="not-found">
          Apollo mmWave: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};Ee.styles=a`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
  `,Ae([vt({attribute:!1})],Ee.prototype,"hass",void 0),Ae([ft()],Ee.prototype,"_config",void 0),ae("apollo-radar-distance-card",Ee),le("apollo-radar-distance-card","Apollo Radar Distance Chart","Distance / zone chart for Apollo MSR (LD2410) & R PRO (LD2412).");var Ce="apollo_mmwave",Me=`${Ce}/calibration/subscribe`,Ie=[1e3,2e3,5e3,1e4,2e4],Le="Apollo mmWave is not loaded, so calibration is unavailable.",De="Home Assistant has no device with this id. The radar was probably removed and re-added; reload the dashboard, or set device_id in the card YAML.",Pe=/^Validation error:\s*/;async function Oe(t,e,n){return t.connection.subscribeMessage(n,{type:Me,device_id:e})}async function Fe(t,e){try{return await t.connection.subscribeMessage(t=>{(Array.isArray(t)?t:[t]).some(t=>{var e,n;return("updated"===(null==t?void 0:t.type)||"added"===(null==t?void 0:t.type))&&"apollo_mmwave"===(null==t||null===(e=t.entry)||void 0===e?void 0:e.domain)&&"loaded"===(null==t||null===(n=t.entry)||void 0===n?void 0:n.state)})&&e()},{type:"config_entries/subscribe"})}catch{return null}}function Ne(t,e,n,i,s=!1){return t.callService(e,n,i,void 0,s)}function Ue(t){const e={};for(const[n,i]of Object.entries(t))void 0!==i&&(e[n]=i);return e}function je(t){if(t&&"object"==typeof t&&void 0===t.code){const e=t.error;if(e&&"object"==typeof e)return e}return t}function Be(t){const e=je(t);if("apollo_mmwave"===(null==e?void 0:e.translation_domain))return"string"==typeof e.translation_key?e.translation_key:void 0}function He(t){const e=t.trim();return/[.!?]$/.test(e)?e:`${e}.`}function Ze(t,e={}){const n=je(t),i=null==n?void 0:n.code;if("not_found"===i){var s;if("service"!==e.source)return De;const t=null==n||null===(s=n.translation_placeholders)||void 0===s?void 0:s.domain;if(void 0===t||"apollo_mmwave"===t)return Le}if("not_loaded"===i)return Le;const o=function(t,e){const n=null==t?void 0:t.translation_domain,i=null==t?void 0:t.translation_key;if(!e||!n||!i)return null;let s;try{s=e(`component.${n}.exceptions.${i}.message`,t.translation_placeholders??void 0)}catch{return null}return!s||s.startsWith("Translation error")?null:He(s)}(n,e.localize);if(o)return o;const r="string"==typeof n?n:null==n?void 0:n.message;if(r){const t=String(r).replace(Pe,"");if(t.trim())return He(t)}return"Home Assistant rejected the request."}async function Ge(t,e){var n;const i=null===(n=je(e))||void 0===n?void 0:n.translation_domain;if(i&&"function"==typeof t.loadBackendTranslation)try{const e=await t.loadBackendTranslation("exceptions",i);if("function"==typeof e)return e}catch{}return"function"==typeof t.localize?t.localize.bind(t):void 0}async function We(t,e){return Ze(e,{source:"service",localize:await Ge(t,e)})}var qe=.5,Je=["move","still"],Ve="If Radar Target turns off while someone sits still, raise Radar Timeout to 60 s or more on the Detection Range card. Undo restores the thresholds from before a calibration.",Ke="Read settings from the radar",Xe="Reading settings from the radar...",Ye=/* @__PURE__ */new Set(["done","cancelled","failed"]);function Qe(t){return void 0!==t&&Ye.has(t)}function tn(t){if(!t)return null;const e=new Date(t);return Number.isNaN(e.getTime())?null:e}function en(t,e){return t.toDateString()===e.toDateString()}var nn={hour:"2-digit",minute:"2-digit"},sn={day:"numeric",month:"short"};function on(t,e=/* @__PURE__ */new Date){const n=tn(t);if(!n)return t;const i=en(n,e)?nn:{...sn,...nn};return new Intl.DateTimeFormat(void 0,i).format(n)}function rn(t){const e=tn(t);return e?new Intl.DateTimeFormat(void 0,{...sn,...nn}).format(e):t}function an(t){if(t>=60&&t%60==0){const e=t/60;return`${e} ${1===e?"minute":"minutes"}`}return`${t} ${1===t?"second":"seconds"}`}function ln(t,e){return`${t} ${1===t?e:`${e}s`}`}function dn(t){return Object.keys(t).sort((t,e)=>Number(t)-Number(e))}function cn(t){const e=[];for(const i of["move","still"]){var n;const s=(null===(n=t.peaks)||void 0===n?void 0:n[i])??{},o=dn(s);if(0===o.length)continue;const r=o.map(t=>`G${t} ${s[t]}`).join(" · ");e.push(`Highest so far, ${i}: ${r}`)}return e}var un="Reading the radar's current thresholds...",hn="Checking that the radar accepted the new values...",_n="Restoring saved thresholds...",pn="Finishing...";function vn(t){if("restore"===t.kind)switch(t.status){case"applying":return"refresh"===t.sub_phase?{phase:un,detail:""}:{phase:_n,detail:`${t.writes_done} of ${t.writes_total}`};case"verifying":return{phase:hn,detail:""};case"preparing":return{phase:_n,detail:""};default:return{phase:pn,detail:""}}switch(t.status){case"preparing":return"settle"===t.sub_phase?{phase:"Leave the room now.",detail:""}:"warmup"===t.sub_phase?{phase:"Waiting for gate energy from the radar...",detail:""}:{phase:"Turning on Radar Engineering Mode...",detail:""};case"sampling":return{phase:"Listening to the empty room...",detail:`${t.remaining_s??t.duration_s} s left`};case"applying":return"refresh"===t.sub_phase?{phase:un,detail:""}:{phase:`Writing ${t.writes_total} thresholds to the radar...`,detail:`${t.writes_done} of ${t.writes_total}`};case"verifying":return{phase:hn,detail:""};default:return{phase:pn,detail:""}}}function fn(t){return Number.isFinite(t)?Math.max(0,Math.min(1,t)):0}function gn(t){return null==t?"":String(Math.round(10*t)/10)}function mn(t){return null===t.peak||void 0===t.peak?"":t.flags.includes("spike")?`${gn(t.peak)} (spike seen)`:gn(t.peak)}function yn(t,e){var n;const i=e?null==t||null===(n=t.states)||void 0===n||null===(n=n[e])||void 0===n||null===(n=n.attributes)||void 0===n?void 0:n.max:void 0,s="number"==typeof i?i:"string"==typeof i?parseFloat(i):NaN;return Number.isFinite(s)?s:100}var $n=()=>100;function bn(t,e){return!t.skipped&&!t.flags.includes("unused")&&(null!==t.old&&void 0!==t.old&&null!==t.new&&void 0!==t.new&&(Math.abs(t.old-e)<=qe&&t.new<e-qe))}function wn(t,e,n){if("not selected"===t.skipped)return null===t.old?"(not selected)":`${gn(t.old)} (not selected)`;if(t.skipped)return`skipped: ${t.skipped}`;if(null===t.new||void 0===t.new)return"no data";if(t.written&&!1===t.confirmed&&null===t.actual)return"not confirmed (radar offline)";const i=t.flags.includes("off");if(!(null===t.old||Math.abs(t.new-t.old)>qe))return i?`${gn(t.new)} (off)`:`${gn(t.old)} (unchanged)`;const s=`${gn(t.old)} → ${gn(t.new)}`,o=[];return i&&o.push("off"),bn(t,n)&&o.push("was off"),!e&&t.written&&!1===t.confirmed&&o.push("not confirmed"),o.length?`${s} (${o.join(", ")})`:s}function xn(t,e,n){return{peak:mn(t),text:wn(t,e,n(t.entity_id)),flags:[...t.flags]}}function kn(t){const e=[t.move,t.still].filter(t=>"not selected"!==t.skipped);return e.length>0&&e.every(t=>t.flags.includes("unused"))}function Sn(t){return t.map(t=>`G${t}`).join(", ")}function Tn(t,e){return`G${t} ${e} threshold`}function zn(t){const e=t.unverified??[];if(0===e.length)return null;const n=e.map(e=>{const n=function(t,e){for(const n of t.gates??[]){if(n.move.entity_id===e)return Tn(n.gate,"move");if(n.still.entity_id===e)return Tn(n.gate,"still")}return e}(t,e.entity_id);return null===e.actual||void 0===e.actual?`${n} could not be read (radar offline)`:`${n} reads back ${gn(e.actual)} (asked for ${gn(e.asked)})`});return`${ln(e.length,"value")} could not be confirmed: ${n.join(", ")}. Check the Move / Still Thresholds cards.`}function Rn(t){const e=[],n=t.warnings??[];for(const i of n)if("presence"===i){const n=Math.round(100*(t.presence_fraction??0));e.push(`The radar reported someone present for ${n}% of the listen. If someone was in the room, even sitting still, press Undo and run it again.`)}else if("radar_unavailable"===i)e.push("The radar was unavailable for part of the listen; gates with too few readings were left as they were.");else if("unverified"===i){const n=zn(t);n&&e.push(n)}else if("gate_off"===i)for(const n of t.gates_off??[])e.push(`The ${Tn(n.gate,n.channel)} is now off (its background peaked at ${gn(n.peak)}). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty.`);if(!n.includes("unverified")&&"restore"===t.kind){const n=zn(t);n&&e.push(n)}return e}function An(t){return"move"===t?"Move Thresholds":"Still Thresholds"}function En(t,e=$n){const n="preview"===t.outcome;if("calibrate"!==t.kind)return[];if(!n&&"applied"!==t.outcome&&"partial"!==t.outcome)return[];const i=[];for(const s of t.gates??[])for(const t of Je){const o=s[t],r=e(o.entity_id);if(!bn(o,r))continue;if(!(n||o.written&&!1!==o.confirmed))continue;const a=Tn(s.gate,t),l=gn(r),d=An(t);i.push(n?`The ${a} is off (set to ${l}) and calibration would turn it back on (would set ${gn(o.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card after you calibrate.`:`The ${a} was off (set to ${l}) and calibration turned it back on (now ${gn(o.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card, or press Undo to put back all your previous values.`)}return i}function Cn(t,e){var n;if(!e)return null;const i=parseFloat((null===(n=t.states[e])||void 0===n?void 0:n.state)??"");return Number.isFinite(i)?Math.trunc(i):null}function Mn(t,e,n,i){return"ld2412"===n?{max_move_gate:null,max_still_gate:null,min_gate:Cn(t,e.max_still_distance)??(null==i?void 0:i.min_gate)??null,max_gate:Cn(t,e.max_move_distance)??(null==i?void 0:i.max_gate)??null}:{max_move_gate:Cn(t,e.max_move_distance)??(null==i?void 0:i.max_move_gate)??null,max_still_gate:Cn(t,e.max_still_distance)??(null==i?void 0:i.max_still_gate)??null,min_gate:null,max_gate:null}}function In(t,e,n,i){if("ld2412"===t)return!(null!==e.min_gate&&n<e.min_gate)&&(null===e.max_gate||n<=e.max_gate);const s="move"===i?e.max_move_gate:e.max_still_gate;return null===s||n<=s}function Ln(t,e,n,i){var s;if(!t||"calibrate"!==t.kind)return!1;if("applied"!==t.outcome&&"partial"!==t.outcome)return!1;if((t.gates_off??[]).some(t=>t.gate===e&&t.channel===n))return!0;const o=null===(s=t.gates)||void 0===s||null===(s=s.find(t=>t.gate===e))||void 0===s?void 0:s[n];return!(!(null==o?void 0:o.written)||null===o.new||void 0===o.new)&&Math.abs(o.new-i)<=qe}function Dn(t,e){let n=0;for(let i=e;i<t.length;i++){if("calibrate"===t[i].reason)return n%2==0?"previous":"calibrated";n+=1}return null}function Pn(t,e=/* @__PURE__ */new Date){const n=t[0];if(!n)return"Nothing to restore yet";switch(Dn(t,0)){case"previous":return"Undo (restore your previous values)";case"calibrated":return"Redo (put the calibrated values back)";default:return`Restore the values saved at ${on(n.taken_at,e)}`}}function On(t,e=/* @__PURE__ */new Date){const n=t[0];if(!n)return;const i=tn(n.taken_at),s=on(n.taken_at,e);return i&&en(i,e)?`Saved at ${s}`:`Saved ${s}`}function Fn(t,e="changed"){const n=t.changed??0;return`${n} of ${n+(t.unchanged??0)} thresholds ${e}`}function Nn(t){const e=t.writes_done??0;return 0===e?"Stopped. Nothing was changed.":`Stopped after ${e} of ${t.writes_total??e} values were written. Undo restores the saved values.`}function Un(t,e=/* @__PURE__ */new Date){if("failed"===t.status||"failed"===t.outcome)return Hn(t);if("cancelled"===t.outcome)return Nn(t);const n=on(t.finished_at,e);if("restore"===t.kind){const e=t.restored??0,i=t.unchanged??0;return`Restored ${ln(e,"value")} at ${n}, ${i} unchanged.`}const i=ln(t.samples??0,"sample");return"preview"===t.outcome?`Previewed at ${n} from ${i}. ${Fn(t,"would change")}.`:`Calibrated at ${n} from ${i}. ${Fn(t)}.`}function jn(t){const e=t.writes_done??0;return 0===e?". Nothing was changed.":` after ${e} of ${t.writes_total??e} values were written.`}var Bn=/nothing was changed/i;function Hn(t){var e;const n=(null===(e=t.error)||void 0===e?void 0:e.message)??"Unknown error.",i="restore"===t.kind?"Restore failed: ":"Calibration failed: ";return 0!==(t.writes_done??0)||Bn.test(n)?`${i}${n}`:`${i}${n} Nothing was changed.`}function Zn(t,e){const n=t.restored_from;if((null==n?void 0:n.id)||(null==n?void 0:n.taken_at))return n;if(t.snapshot_id){const n=e.findIndex(e=>e.id===t.snapshot_id),i=n>=0?e[n+1]:void 0;return i?{id:i.id,taken_at:i.taken_at}:null}const i=e[0];return i?{id:i.id,taken_at:i.taken_at}:null}function Gn(t,e,n=/* @__PURE__ */new Date){const i=Zn(t,e),s=(null==i?void 0:i.id)?function(t,e,n){const i=e.findIndex(t=>t.id===n);if(i<0)return null;let s=0;if(t.snapshot_id){const n=e.findIndex(e=>e.id===t.snapshot_id);if(n<0)return null;s=n+1}return i===s?Dn(e,i):null}(t,e,i.id):null;if("previous"===s)return"Restored your previous values.";if("calibrated"===s)return"Restored the calibrated values.";const o=null==i?void 0:i.taken_at;return o?`Restored the thresholds from ${on(o,n)}.`:"Restored the saved thresholds."}function Wn(t){const e=t.missing??[];return e.length?`Not found any more: ${e.join(", ")}.`:null}var qn={observedFinish:null,lastJobId:null,lastJobTerminal:!1};var Jn="#4b0082",Vn="#9467bd",Kn="#274e13",Xn="#8cb640",Yn="var(--secondary-text-color, #9aa0a6)",Qn=a`
  .chart-legend {
    font-size: 0.8em;
    color: var(--secondary-text-color);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 6px;
  }
  .chart-verdict {
    font-size: 0.9em;
    margin-top: 6px;
  }
  .chart-verdict.note {
    color: var(--secondary-text-color);
    margin-top: 2px;
  }
`,ti="The radar reports no target.",ei=["engineering_mode","move_threshold","still_threshold","move_energy","still_energy","max_move_distance","max_still_distance","moving_target","still_target"];function ni(t,e,n){var i,s;let o=!1;const r=Mn(t,e,n,null),a=e=>{e&&e in t.states&&(o=!0)},l=ge(e),d=Array.from({length:l},(i,s)=>(a(e.move_energy[s]),a(e.still_energy[s]),a(e.move_threshold[s]),a(e.still_threshold[s]),{index:s,move:_e(t,e.move_energy[s])??0,still:_e(t,e.still_energy[s])??0,moveThr:_e(t,e.move_threshold[s]),stillThr:_e(t,e.still_threshold[s]),moveInUse:In(n,r,s,"move"),stillInUse:In(n,r,s,"still")})),c=function(t,e){const n=e=>{var n;return e?null===(n=t.states[e])||void 0===n?void 0:n.state:void 0},i=n(e.moving_target),s=n(e.still_target);if(["on","off"].includes(i??"")&&["on","off"].includes(s??""))return"on"===i&&"on"===s?"The radar reports a moving and a still target.":"on"===i?"The radar reports a moving target.":"on"===s?"The radar reports a still target.":ti}(t,e);return{engineeringMode:!!e.engineering_mode&&"on"===(null===(i=t.states[e.engineering_mode])||void 0===i?void 0:i.state),unavailable:!!e.engineering_mode&&"unavailable"===(null===(s=t.states[e.engineering_mode])||void 0===s?void 0:s.state),present:o,gates:d,verdict:c,noTarget:c===ti}}function ii(t){return 10+186*(1-Math.max(0,Math.min(100,t))/100)}var si=class extends ut{setConfig(t){this._config=t}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-gate-energy-card"}}shouldUpdate(t){if(!t.has("hass")||t.has("_config"))return!0;const e=t.get("hass");if(!e||!this.hass||!this._config)return!0;if(e.entities!==this.hass.entities||e.devices!==this.hass.devices)return!0;const n=this._resolved;return this._resolved=Qt(n,this.hass,this._config),this._watched=Xt(this._watched,this._resolved,ei),ee(e,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return J;this._resolved=Qt(this._resolved,this.hass,this._config);const{map:t,profile:e,radarIds:n}=this._resolved;if(!ne(this.hass,n))return this._renderNotFound();const i=(null==e?void 0:e.label)??"LD2410",s=function(t,e,n="LD2410",i){var s;const o=ni(t,e,i);if(!o.present)return J;const r=444/o.gates.length,a=.32*r,l=ii(0);let d=!1;const c=o.gates.map(t=>{const e=26+r*t.index+r/2,n=e-a-2,i=e+2,s=[],c=o.engineeringMode&&t.moveInUse&&void 0!==t.moveThr&&t.move>t.moveThr,u=o.engineeringMode&&t.stillInUse&&void 0!==t.stillThr&&t.still>t.stillThr;(c||u)&&(d=!0);const h=t.moveInUse?J:.3,_=t.stillInUse?J:.3;if(s.push(W`
      <rect x=${n} y=${ii(t.move)} width=${a} height=${l-ii(t.move)}
        fill=${Jn} opacity="${h}"
        stroke="${c?Vn:J}"
        stroke-width="${c?"2":J}"></rect>
      <rect x=${i} y=${ii(t.still)} width=${a} height=${l-ii(t.still)}
        fill=${Kn} opacity="${_}"
        stroke="${u?Xn:J}"
        stroke-width="${u?"2":J}"></rect>
      <text x=${e} y=${213} font-size="13" text-anchor="middle"
        fill=${Yn}>G${t.index}</text>`),o.engineeringMode&&void 0!==t.moveThr){const e=ii(t.moveThr),i=n+a/2;s.push(W`<path d="M ${i-5} ${e-5} L ${i-5} ${e+5} L ${i+5} ${e} Z"
        fill=${Vn} opacity="${h}"></path>`)}if(o.engineeringMode&&void 0!==t.stillThr){const e=ii(t.stillThr),n=i+a/2;s.push(W`<path d="M ${n+5} ${e-5} L ${n+5} ${e+5} L ${n-5} ${e} Z"
        fill=${Xn} opacity="${_}"></path>`)}return s}),u=[0,25,50,75,100].map(t=>W`
      <line x1=${26} y1=${ii(t)} x2=${470} y2=${ii(t)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${22} y=${ii(t)+3} font-size="11" text-anchor="end"
        fill=${Yn}>${t}</text>`),[h,_]=o.unavailable?["Radar unavailable","Waiting for the device to reconnect"]:["Turn on Radar Engineering Mode","to see gate energy values"],p=o.engineeringMode?J:W`
        <rect x=${26} y=${10} width=${444} height=${186}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${248} y=${103} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${248} dy="-4">${h}</tspan>
          <tspan x=${248} dy="28">${_}</tspan>
        </text>`,v=e.engineering_mode,f=v?null===(s=t.states[v])||void 0===s?void 0:s.state:void 0,g=!o.engineeringMode&&v&&t.callService&&void 0!==f&&"unavailable"!==f?G`<button
        type="button"
        class="overlay"
        tabindex="0"
        style="position:absolute;left:${248/470*100}%;top:${72.18181818181819}%;transform:translate(-50%,-50%)"
        @click=${()=>Ne(t,"switch","turn_on",{entity_id:v},!0).catch(()=>{})}
      >
        Turn on Radar Engineering Mode
      </button>`:J,m=G`
    <svg viewBox="0 0 ${470} ${220}" width="100%" role="img"
      aria-label="${n} gate energy">
      <title>
        Per-gate signal energy (bars) vs your thresholds (triangles). A bar
        above its threshold is outlined. Faded gates are outside the range the
        radar uses, so their energy does not count. Turn on Radar Engineering
        Mode to see live energy.
      </title>
      ${u} ${c} ${p}
    </svg>
  `,y=o.gates.some(t=>!t.moveInUse||!t.stillInUse),$=o.engineeringMode&&o.verdict?o.verdict:void 0,b=!!$&&o.noTarget&&d&&"ld2412"!==i;return G`
    <div class="chart-plot" style="position:relative">
      ${m} ${g}
    </div>
    <div class="chart-legend">
      <span><span style="color:${Jn}">■</span> Move energy</span>
      <span><span style="color:${Kn}">■</span> Still energy</span>
      <span><span style="color:${Vn}">▶</span> Move threshold</span>
      <span><span style="color:${Xn}">◀</span> Still threshold</span>
      <span>outlined bar = above threshold</span>
      ${y?G`<span>faded = outside the radar's range (ignored)</span>`:J}
    </div>
    <div class="chart-answer">
      ${$?G`<div class="chart-verdict">${$}</div>`:J}
      ${b?G`<div class="chart-verdict note">${"Energy above a threshold does not always mean a target. Once the LD2410 loses someone who sits still, it often needs them to move before it detects them again."}</div>`:J}
    </div>
  `}(this.hass,t,i,null==e?void 0:e.key);return s===J?J:G`
      <ha-card .header=${this._config.title??`${i} Gate Energy`}>
        <div class="wrap">${s}</div>
      </ha-card>
    `}_renderNotFound(){var t,e;const n=(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.label)??"LD2410";return G`
      <ha-card .header=${(null===(e=this._config)||void 0===e?void 0:e.title)??`${n} Gate Energy`}>
        <div class="not-found">
          Apollo mmWave: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};si.styles=[Qn,a`
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
    `],Ae([vt({attribute:!1})],si.prototype,"hass",void 0),Ae([ft()],si.prototype,"_config",void 0),ae("apollo-radar-gate-energy-card",si),le("apollo-radar-gate-energy-card","Apollo Radar Gate Energy Chart","Per-gate move/still energy chart for Apollo MSR (LD2410) & R PRO (LD2412).");var oi="apollo-radar-calibrate-card",ri="Calibrate with empty room";function ai(t){const e=/^(.+?) (\([^()]*\))$/.exec(t);return e?G`<span class="value">${e[1]}</span> <span class="note">${e[2]}</span>`:G`<span class="value">${t}</span>`}function li(t){try{const e=t();e&&"function"==typeof e.catch&&e.catch(()=>{})}catch{}}var di=class extends ut{constructor(...t){super(...t),this._local=qn,this._loadState="loading",this._loadError="",this._showLastResult=!1,this._readingSettings=!1,this._unsubscribe=null,this._serial=0,this._pending=!1,this._retryTimer=null,this._retryIndex=0,this._onReady=()=>this._reopen(),this._onDisconnected=()=>this._cancelRetry(),this._entryFeed=null,this._entryFeedSerial=0,this._lastJobApply=null,this._readSettingsToken=0,this._maxOf=t=>yn(this.hass,t)}setConfig(t){this._config=t}getCardSize(){return 6}static getStubConfig(){return{type:`custom:${oi}`}}connectedCallback(){super.connectedCallback(),this._attachConnectionListeners(),this._open()}disconnectedCallback(){super.disconnectedCallback(),this._cancelReadSettings(),this._detachConnectionListeners(),this._closeEntryFeed(),this._close()}shouldUpdate(t){if(1!==t.size||!t.has("hass"))return!0;const e=t.get("hass");return!(e&&this.hass&&this._config)||(e.entities!==this.hass.entities||e.devices!==this.hass.devices||e.connection!==this.hass.connection||(this._resolved=Qt(this._resolved,this.hass,this._config),te(e,this.hass,this._watchedIds())))}willUpdate(t){if(!this.hass||!this._config)return;if(!t.has("hass")&&!t.has("_config"))return;this._resolved=Qt(this._resolved,this.hass,this._config);const e=function(t,e,n){if(e.device_id)return e.device_id;for(const s of Vt(n)){var i;const e=null===(i=t.entities[s])||void 0===i?void 0:i.device_id;if(e)return e}}(this.hass,this._config,this._resolved.map);this._attachConnectionListeners(),e!==this._deviceId&&(this._deviceId=e,this._payload=void 0,this._local=qn,this._failure=void 0,this._stopError=void 0,this._turnOffError=void 0,this._lastJobApply=null,this._showLastResult=!1,this._cancelReadSettings(),this._retryIndex=0,this._loadState="loading",this._close()),this._open()}_watchedIds(){var t,e;const n=null===(t=this._resolved)||void 0===t?void 0:t.map;if(!n)return[];const i=null===(e=this._payload)||void 0===e?void 0:e.entities;return[n.engineering_mode,...n.move_threshold,...n.still_threshold,n.max_move_distance,n.max_still_distance,n.radar_target,n.background_correction_status,null==i?void 0:i.engineering_mode,null==i?void 0:i.background_status].filter(t=>!!t)}_apiHass(){var t;const e=this.hass;if((null==e?void 0:e.callService)&&(null===(t=e.connection)||void 0===t?void 0:t.subscribeMessage))return e}_open(){if(this._openEntryFeed(),!this.isConnected||this._unsubscribe||this._pending||this._retryTimer)return;const t=this._apiHass(),e=this._deviceId;if(!t||!e)return;const n=++this._serial;this._pending=!0,Oe(t,e,t=>{n===this._serial&&this._applyPayload(t)}).then(t=>{n===this._serial?(this._pending=!1,this._unsubscribe=t,this._retryIndex=0,"idle"!==this._loadState&&(this._loadState=this._payload?"idle":"loading")):li(t)},t=>{n===this._serial&&(this._pending=!1,this._failOpen(t))})}_failOpen(t){const e=null==t?void 0:t.code;if("not_loaded"===e&&this._retryIndex<Ie.length){const t=Ie[this._retryIndex];return this._retryIndex+=1,this._loadState="retrying",void(this._retryTimer=setTimeout(()=>{this._retryTimer=null,this._open()},t))}this._loadState="not_loaded"===e?"not_loaded":"error",this._loadError=Ze(t)}_close(){this._serial+=1,this._pending=!1,this._cancelRetry();const t=this._unsubscribe;this._unsubscribe=null,t&&li(t)}_cancelRetry(){null!==this._retryTimer&&(clearTimeout(this._retryTimer),this._retryTimer=null)}_reopen(){this._retryIndex=0,this._close(),this._open()}_openEntryFeed(){const t=this._apiHass(),e=null==t?void 0:t.connection;if(!(this.isConnected&&t&&e&&this._deviceId))return;if(this._entryFeedConnection===e)return;this._closeEntryFeed(),this._entryFeedConnection=e;const n=++this._entryFeedSerial;Fe(t,()=>{n===this._entryFeedSerial&&this._reopen()}).then(t=>{n===this._entryFeedSerial?this._entryFeed=t:t&&li(t)})}_closeEntryFeed(){this._entryFeedSerial+=1,this._entryFeedConnection=void 0;const t=this._entryFeed;this._entryFeed=null,t&&li(t)}_retryNow(){this._retryIndex=0,this._loadState="loading",this._close(),this._open()}_attachConnectionListeners(){var t;const e=null===(t=this.hass)||void 0===t?void 0:t.connection;this.isConnected&&e&&e!==this._listenedConnection&&(this._detachConnectionListeners(),e.addEventListener&&(e.addEventListener("ready",this._onReady),e.addEventListener("disconnected",this._onDisconnected),this._listenedConnection=e))}_detachConnectionListeners(){const t=this._listenedConnection;this._listenedConnection=void 0,(null==t?void 0:t.removeEventListener)&&(t.removeEventListener("ready",this._onReady),t.removeEventListener("disconnected",this._onDisconnected))}_applyPayload(t){var e;const n=null===(e=this._payload)||void 0===e||null===(e=e.job)||void 0===e?void 0:e.job_id;this._local=function(t,e){var n;const i=e.job;if(i){const e=Qe(i.status);return{observedFinish:e?i.job_id:t.observedFinish,lastJobId:i.job_id,lastJobTerminal:e}}let s=t.observedFinish;return null===t.lastJobId||t.lastJobTerminal||(null===(n=e.last_result)||void 0===n?void 0:n.job_id)!==t.lastJobId||(s=t.lastJobId),{observedFinish:s,lastJobId:null,lastJobTerminal:!1}}(this._local,t),this._payload=t,this._loadState="idle";const i=t.job;i&&(this._lastJobApply={jobId:i.job_id,apply:i.apply}),i&&!Qe(i.status)&&(this._failure=void 0),i&&!Qe(i.status)&&i.job_id===n||(this._stopError=void 0)}_start(t){var e;const n=this._apiHass(),i=this._deviceId;if(!n||!i)return;this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,this._local={...this._local,observedFinish:null};const s={...(null===(e=this._config)||void 0===e?void 0:e.calibration)??{}};t||(s.apply=!1),function(t,e,n={}){return Ne(t,Ce,"calibrate_gates",{device_id:e,...Ue(n)})}(n,i,s).catch(e=>this._showServiceFailure("Calibration failed: ",e,()=>this._start(t)))}async _showServiceFailure(t,e,n){const i=this._deviceId,s=await We(this.hass??{},e);i===this._deviceId&&(this._failure={prefix:t,message:s,retry:n,code:Be(e)})}_stop(){const t=this._apiHass(),e=this._deviceId;t&&e&&(this._stopError=void 0,function(t,e){return Ne(t,Ce,"cancel_calibration",{device_id:e})}(t,e).catch(async t=>{const n=await We(this.hass??{},t);e===this._deviceId&&(this._stopError=`Could not stop the calibration: ${n}`)}))}_undo(t){const e=this._apiHass(),n=this._deviceId;e&&n&&(this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,function(t,e,n){return Ne(t,Ce,"restore_gate_thresholds",{device_id:e,...n?{snapshot_id:n}:{}})}(e,n,t).catch(e=>this._showServiceFailure("Restore failed: ",e,()=>this._undo(t))))}_turnOff(){const t=this._apiHass(),e=this._engineeringSwitchId();if(!t||!e)return;const n=this._deviceId;this._turnOffError=void 0,function(t,e,n){return Ne(t,"switch",n?"turn_on":"turn_off",{entity_id:e})}(t,e,!1).catch(async t=>{const e=await We(this.hass??{},t);n===this._deviceId&&(this._turnOffError=`Could not turn Radar Engineering Mode off: ${e}`)})}_readSettingsThenRetry(t,e){const n=this._apiHass(),i=this._deviceId;if(!n||!i||this._readingSettings)return;const s=++this._readSettingsToken,o=()=>s===this._readSettingsToken&&i===this._deviceId;this._readingSettings=!0,this._readSettingsError=void 0,function(t,e){return Ne(t,"button","press",{entity_id:e})}(n,t).then(()=>{setTimeout(()=>{var t;if(!o())return;this._readingSettings=!1;const n=null===(t=this._payload)||void 0===t?void 0:t.job;n&&!Qe(n.status)||e()},3e3)},async t=>{const e=await We(this.hass??{},t);o()&&(this._readingSettings=!1,this._readSettingsError=`Could not ask the radar for its settings: ${e}`)})}_cancelReadSettings(){this._readSettingsToken+=1,this._readingSettings=!1,this._readSettingsError=void 0}_closeResult(){this._cancelReadSettings(),this._failure=void 0,this._local={...this._local,observedFinish:null}}_profileKey(){var t,e;return(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.key)??(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.profile)}_engineeringSwitchId(){var t,e;return(null===(t=this._resolved)||void 0===t?void 0:t.map.engineering_mode)??(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.engineering_mode)??void 0}_engineeringOn(){var t,e;const n=this._engineeringSwitchId(),i=n&&this.hass?null===(t=this.hass.states[n])||void 0===t?void 0:t.state:void 0;return void 0!==i?"on"===i:!!(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.engineering_mode_on)}_backgroundOn(){var t,e,n,i;const s=(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.background_status)??(null===(e=this._resolved)||void 0===e?void 0:e.map.background_correction_status),o=s&&this.hass?null===(n=this.hass.states[s])||void 0===n?void 0:n.state:void 0;return void 0!==o?"on"===o:!!(null===(i=this._payload)||void 0===i||null===(i=i.entities)||void 0===i?void 0:i.background_status_on)}_queryParamsButtonId(){var t,e,n;const i=(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.query_params_button)??(null===(e=this._resolved)||void 0===e?void 0:e.map.query_params);return i&&(null===(n=this.hass)||void 0===n?void 0:n.states[i])?i:void 0}_warningLines(t){return[...Rn(t),...En(t,this._maxOf)]}_online(){var t;if(!this.hass||!this._resolved)return!1;if(!ne(this.hass,this._resolved.ids))return!1;const e=this._engineeringSwitchId(),n=e?null===(t=this.hass.states[e])||void 0===t?void 0:t.state:void 0;return void 0!==n&&"unavailable"!==n}render(){return this.hass&&this._config?(this._resolved=Qt(this._resolved,this.hass,this._config),G`
      <ha-card .header=${this._config.title??"Auto-calibrate"}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `):J}_renderSubtitle(){var t,e;const n=this._deviceId;if(!n||!this.hass)return J;const i=(null===(t=this._resolved)||void 0===t||null===(t=t.profile)||void 0===t?void 0:t.label)??(null===(e=this._profileKey())||void 0===e?void 0:e.toUpperCase()),s=this.hass.devices[n],o=(null==s?void 0:s.name_by_user)||(null==s?void 0:s.name);return i||o?G`<div class="subtitle">${[i,o].filter(Boolean).join(" · ")}</div>`:J}_renderBody(){var t;if(!this._deviceId)return G`<p class="hint">${"Add device_id to this card's configuration to enable auto-calibration."}</p>`;if("retrying"===this._loadState)return G`<div class="status" aria-live="polite"><p>${"Apollo mmWave is still loading..."}</p></div>`;if("not_loaded"===this._loadState||"error"===this._loadState){const t="not_loaded"===this._loadState?"Apollo mmWave is not loaded, so calibration is unavailable.":this._loadError;return G`
        <div class="section">
          <div class="status" aria-live="polite"><p class="error">${t}</p></div>
          <div class="buttons">
            <button type="button" class="secondary" @click=${this._retryNow}>Retry</button>
          </div>
        </div>
      `}const e=this._payload;if(!e)return G`<div class="status" aria-live="polite"><p class="hint">Loading...</p></div>`;const n=e.job;return n&&!Qe(n.status)?this._renderRunning(n):this._failure?this._renderFailure(this._failure,e):n&&(null===(t=e.last_result)||void 0===t?void 0:t.job_id)!==n.job_id?this._renderFinishing():function(t,e){var n;return null!==t.observedFinish&&!(e.job&&!Qe(e.job.status))&&(null===(n=e.last_result)||void 0===n?void 0:n.job_id)===t.observedFinish}(this._local,e)&&e.last_result?this._renderResult(e.last_result,e):this._renderIdle(e)}_renderRunning(t){const e=function(t,e){const n=function(t){return"ld2412"===t?"Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes.":"Leave Radar Engineering Mode on until this finishes."}(e),{phase:i,detail:s}=vn(t),o=s?`${i} ${s}`:i;if("restore"===t.kind)return[o];switch(t.status){case"preparing":return"engineering"===t.sub_phase?[o]:"settle"===t.sub_phase?[o,`Listening starts in ${t.remaining_s??t.settle_s} s.`,n]:[o,n];case"sampling":return[o,`Keep the room empty. ${ln(t.samples,"sample")} so far.`,...cn(t),n];case"applying":return"refresh"===t.sub_phase?[o]:[o,"Values already written stay until you undo."];default:return[o]}}(t,this._profileKey()),{phase:n,detail:i}=vn(t),s="calibrate"===t.kind&&("preparing"===t.status||"sampling"===t.status||"applying"===t.status);return G`
      <div class="section">
        <div class="status">
          <p class="headline"><span class="phase" aria-live="polite">${n}</span>${i?` ${i}`:""}</p>
          ${e.slice(1).map(t=>G`<p>${t}</p>`)}
        </div>
        ${this._renderBar(t)}
        ${s?G`
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
            `:J}
        ${this._stopError?G`<p class="error" role="alert">${this._stopError}</p>`:J}
      </div>
    `}_renderBar(t){const{fraction:e,label:n}=function(t){return"preparing"===t.status&&"settle"===t.sub_phase&&t.settle_s>0?{fraction:fn(t.elapsed_s/t.settle_s),label:`${t.remaining_s??t.settle_s} s`}:"sampling"===t.status&&t.duration_s>0?{fraction:fn(t.elapsed_s/t.duration_s),label:`${t.remaining_s??t.duration_s} s left`}:"applying"===t.status&&"refresh"!==t.sub_phase&&t.writes_total>0?{fraction:fn(t.writes_done/t.writes_total),label:`${t.writes_done} of ${t.writes_total}`}:{fraction:null,label:""}}(t),i=null===e?100:Math.round(100*e);return G`
      <div
        class="bar ${null===e?"indeterminate":""}"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${null===e?J:i}
        aria-label=${n||J}
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
    `}_renderReadSettingsLines(t){if("thresholds_not_numeric"!==t)return J;const e=this._queryParamsButtonId()?"":"Open the radar's device page, press its Query Params button in the Diagnostic section, wait a few seconds, then try again.";return G`<div class="read-settings">
      ${e?G`<p>${e}</p>`:J}
      ${this._readingSettings?G`<p>${Xe}</p>`:J}
      ${this._readSettingsError?G`<p class="error" role="alert">${this._readSettingsError}</p>`:J}
    </div>`}_renderRetryButton(t,e){const n="thresholds_not_numeric"===t?this._queryParamsButtonId():void 0;return n?G`<button
      type="button"
      class="primary"
      ?disabled=${this._readingSettings}
      @click=${()=>this._readSettingsThenRetry(n,e)}
    >
      ${Ke}
    </button>`:G`<button type="button" class="primary" @click=${e}>Try again</button>`}_renderResult(t,e){const n=e.snapshots??[],i=this._renderBanner(e),s=n.length?G`<button
          type="button"
          class="secondary"
          title=${On(n)??J}
          @click=${()=>this._undo()}
        >
          ${Pn(n)}
        </button>`:J,o=t=>G`<button type="button" class="primary" @click=${()=>this._start(!0)}>${t}</button>`;var r;if("failed"===t.status||"failed"===t.outcome)return G`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="error">${Hn(t)}</p>
            ${this._renderReadSettingsLines(null===(r=t.error)||void 0===r?void 0:r.code)}
          </div>
          <div class="buttons">
            ${function(t){return(t.writes_done??0)>0&&!!t.snapshot_id}(t)?s:J} ${this._renderTryAgain(t,n)}
            ${this._closeButton()}
          </div>
        </div>
      `;if("cancelled"===t.outcome){const e=t.writes_done??0;return G`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite"><p>${Nn(t)}</p></div>
          <div class="buttons">
            ${e>0?s:J} ${o(ri)} ${this._closeButton()}
          </div>
        </div>
      `}if("restore"===t.kind){const r=Wn(t);return G`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="headline">${Gn(t,n)}</p>
            ${r?G`<p>${r}</p>`:J}
            ${this._warningLines(t).map(t=>G`<p class="warning">${t}</p>`)}
          </div>
          ${this._renderIdleBody(e)}
          <div class="buttons">${s} ${o(ri)}</div>
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
          <div class="buttons">${o("Calibrate and apply")} ${this._closeButton()}</div>
        </div>
      `:G`
      <div class="section">
        ${i}
        <div class="status" aria-live="polite">
          <p class="headline">${function(t){return"partial"===t.outcome?`Thresholds updated, ${(t.unverified??[]).length} could not be confirmed`:"Thresholds updated"}(t)}</p>
          <p>${Un(t)}</p>
        </div>
        ${this._renderTable(t)}
        ${this._warningLines(t).map(t=>G`<p class="warning">${t}</p>`)}
        <p>${"Now walk around, then sit still for a minute: the Radar Target row in Target / Occupancy should stay on the whole time you are in the room and turn off a few seconds after you leave (Radar Timeout)."}</p>
        <p class="hint">${Ve}</p>
        <div class="buttons">${s} ${o("Calibrate again")} ${this._closeButton()}</div>
      </div>
    `}_renderTryAgain(t,e){var n;let i;if("restore"===t.kind){const n=Zn(t,e);if(!(null==n?void 0:n.id))return J;const s=n.id;i=()=>this._undo(s)}else{const e=this._lastJobApply,n=!e||e.jobId!==t.job_id||e.apply;i=()=>this._start(n)}return this._renderRetryButton(null===(n=t.error)||void 0===n?void 0:n.code,i)}_renderTable(t){const e=function(t,e=$n){const n="preview"===t.outcome;return(t.gates??[]).map(t=>({gate:t.gate,label:`G${t.gate}`,move:xn(t.move,n,e),still:xn(t.still,n,e),unused:kn(t)}))}(t,this._maxOf),n=function(t){const e=t.gates??[],n=[];if("ld2412"===t.profile){const i=e.filter(t=>t.move.flags.includes("unused")||t.still.flags.includes("unused")),s=t.min_gate??null,o=t.max_gate??null,r=i.filter(t=>null!==s&&t.gate<s).map(t=>t.gate),a=i.filter(t=>null!==o&&t.gate>o).map(t=>t.gate);return r.length&&n.push(`${Sn(r)}: not used (below Min Gate ${s})`),a.length&&n.push(`${Sn(a)}: not used (beyond Max Gate ${o})`),n}const i=e.filter(t=>t.move.flags.includes("unused")).map(t=>t.gate),s=e.filter(t=>t.still.flags.includes("unused")).map(t=>t.gate);return i.length&&n.push(`${Sn(i)}: not used (beyond Max Move Gate ${t.max_move_gate??"?"})`),s.length&&n.push(`${Sn(s)}: not used (beyond Max Still Gate ${t.max_still_gate??"?"})`),n}(t),i=t=>t.includes("unused")?"unused":"";return G`
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
        <td class="threshold ${i(t.move.flags)}">${ai(t.move.text)}</td>
        <td class=${i(t.still.flags)}>${t.still.peak}</td>
        <td class="threshold ${i(t.still.flags)}">${ai(t.still.text)}</td>
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
    `}_renderIdleBody(t){var e,n;const i=(null===(e=this._config)||void 0===e||null===(e=e.calibration)||void 0===e?void 0:e.settle_s)??15,s=(null===(n=this._config)||void 0===n||null===(n=n.calibration)||void 0===n?void 0:n.duration_s)??60,o="ld2412"===this._profileKey(),r=this._engineeringOn()?"Radar Engineering Mode is already on and will stay on.":"Home Assistant turns Radar Engineering Mode on for the listen and back off afterward.",a=!(!this.hass||!this._resolved)&&function(t,e,n,i=[]){if("ld2410"!==n||i.length>0)return!1;const s=kt,o=(e,n)=>{if(0===n.length)return!1;for(let s=0;s<n.length;s++){var i;const o=e[s];if(!o)return!1;const r=null===(i=t.states[o])||void 0===i?void 0:i.state;if(void 0===r)return!1;const a=parseFloat(r);if(!Number.isFinite(a)||a!==n[s])return!1}return!0};return o(e.move_threshold,s.move)&&o(e.still_threshold,s.still)}(this.hass,this._resolved.map,this._profileKey(),t.snapshots??[]),l=this._offGatesLine(t);return G`
      <div class="idle-body">
        <p>${function(t,e){const n=`listens for ${an(e)}, then sets every gate's move and still threshold a margin above the background it heard.`;return`Teach the radar what your empty room looks like. ${t>0?`It counts down ${an(t)} so you can leave, ${n}`:`It ${n}`} Your current thresholds are saved first, so you can undo.`}(i,s)}</p>
        <ul>
        <li>Nobody in the radar's view: people, pets, robot vacuums.</li>
        <li>
          Fans, curtains and plants that normally move are part of the background. Leave them
          as they usually are.
        </li>
        <li>${r}</li>
        ${o?G`<li>
              LD2412: run Start Dynamic Background Correction (Controls card) first with the
              room empty and wait for its status to turn off. Calibrate afterward.
            </li>`:J}
        ${o&&this._backgroundOn()?G`<li>
              Background correction is running on the LD2412. Wait for its status to turn off.
            </li>`:J}
        </ul>
        ${l?G`<p class="warning">${l}</p>`:J}
        ${a?G`<p class="hint">${"These look like factory thresholds. Calibrating sets them for your room."}</p>`:J}
        <p class="hint">${Ve}</p>
      </div>
    `}_offGatesLine(t){if(!this.hass||!this._resolved)return null;const e=this._resolved.map,n=this._profileKey(),i=Mn(this.hass,e,n,t.entities);return function(t){if(0===t.length)return null;const e=t=>`G${t.gate} ${t.channel}`;if(1===t.length){const e=t[0];return`The ${Tn(e.gate,e.channel)} is off (set to ${gn(e.max)}). Calibrating will turn it back on.`}const n=t[0].max;return(t.every(t=>t.max===n)?`These thresholds are off (set to ${gn(n)}): ${t.map(e).join(", ")}.`:`These thresholds are off: ${t.map(t=>`${e(t)} (set to ${gn(t.max)})`).join(", ")}.`)+" Calibrating will turn them back on."}(function(t,e,n,i,s){const o=[],r=Math.max(e.move_threshold.length,e.still_threshold.length);for(let l=0;l<r;l++)for(const r of Je){var a;if("ld2410"===n&&"still"===r&&l<=1)continue;if(!In(n,i,l,r))continue;const d=("move"===r?e.move_threshold:e.still_threshold)[l],c=("move"===r?e.move_energy:e.still_energy)[l];if(!d||!c||void 0===t.states[c])continue;const u=parseFloat((null===(a=t.states[d])||void 0===a?void 0:a.state)??"");if(!Number.isFinite(u))continue;const h=yn(t,d);Math.abs(u-h)>qe||Ln(s,l,r,h)||o.push({gate:l,channel:r,max:h})}return o}(this.hass,e,n,i,t.last_result))}_renderIdleButtons(t,e){const n=function(t,e,n=(()=>{var e;return null==t||null===(e=t.entities)||void 0===e?void 0:e.background_status_on})()??!1){return!(!e||!(null==t?void 0:t.entities)||t.job||!t.entities.engineering_mode||n)}(t,e,this._backgroundOn())&&!!this._apiHass();return G`
      <div class="actions">
        <div class="buttons">
          <button type="button" class="primary" ?disabled=${!n} @click=${()=>this._start(!0)}>
            ${ri}
          </button>
          <button type="button" class="text" ?disabled=${!n} @click=${()=>this._start(!1)}>
            Preview only
          </button>
        </div>
        <p class="helper">${"Computes new thresholds without changing any of them. Radar Engineering Mode is still turned on for the listen."}</p>
      </div>
    `}_renderFooter(t,e){const n=t.last_result;if(!e.length&&!n)return J;const i=function(t){const e=t[0];return e&&null!==Dn(t,0)?`Saved ${rn(e.taken_at)}.`:null}(e);return G`
      <div class="footer">
        ${e.length?G`
              <div class="last">
                ${n?G`<p>${function(t){const e=rn(t.finished_at),n="restore"===t.kind?"restore":!1===t.apply?"preview":"calibration";switch(t.outcome){case"applied":case"partial":return`Last calibrated ${e}, ${Fn(t)}.`;case"restored":return`Last restored ${e}.`;case"preview":return`Last previewed ${e}.`;case"cancelled":return`Last ${n} ${e} was stopped${jn(t)}`;default:var i;return"cancelled_by_shutdown"===(null===(i=t.error)||void 0===i?void 0:i.code)?`Last ${n} ${e} was stopped by a Home Assistant restart${jn(t)}`:`Last ${n} ${e} failed${jn(t)}`}}(n)}</p>`:J}
                <div class="buttons">
                  <button
                    type="button"
                    class="secondary"
                    title=${On(e)??J}
                    @click=${()=>this._undo()}
                  >
                    ${Pn(e)}
                  </button>
                </div>
                ${i?G`<p class="helper">${i}</p>`:J}
              </div>
            `:J}
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
                ${this._showLastResult?this._renderStoredResult(n):J}
              </div>
            `:J}
      </div>
    `}_renderStoredResult(t){if("failed"===t.status||"failed"===t.outcome)return G`<div class="stored"><p class="error">${Hn(t)}</p></div>`;const e=this._warningLines(t).map(t=>G`<p class="warning">${t}</p>`);if("restore"===t.kind)return G`<div class="stored">
        ${function(t){const e=[Un(t)],n=Wn(t);return n&&e.push(n),e}(t).map(t=>G`<p>${t}</p>`)} ${e}
      </div>`;const n=(t.gates??[]).length>0;return G`<div class="stored">
      <p>${Un(t)}</p>
      ${n?this._renderTable(t):J} ${e}
    </div>`}_renderBanner(t){const e=t.interrupted;if(!e)return J;const n=this._engineeringOn()&&("engineering"===e.phase||e.left_on),i="applying"===e.phase;if(!n&&!i)return J;const s=e.left_on?"The last calibration could not turn Radar Engineering Mode back off (the radar was offline).":"restore"===e.kind?"A restore was interrupted by a restart.":"A calibration was interrupted by a restart.",o=t.snapshots??[],r=o.find(t=>t.id===e.snapshot_id)??o[0],a=r?on(r.taken_at):"the start";return G`
      <div class="banner" role="status">
        <p>${s}</p>
        ${n?G`<p>
              Radar Engineering Mode may still be on.
              <button type="button" class="secondary" @click=${this._turnOff}>Turn it off</button>
            </p>`:J}
        ${n&&this._turnOffError?G`<p class="error" role="alert">${this._turnOffError}</p>`:J}
        ${i?G`<p>
              Some thresholds may have been written. Undo restores the values saved at
              ${a}.
              <button type="button" class="secondary" ?disabled=${!r} @click=${()=>this._undo()}>
                Undo
              </button>
            </p>`:J}
      </div>
    `}};di.styles=a`
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
  `,Ae([vt({attribute:!1})],di.prototype,"hass",void 0),Ae([ft()],di.prototype,"_config",void 0),Ae([ft()],di.prototype,"_payload",void 0),Ae([ft()],di.prototype,"_local",void 0),Ae([ft()],di.prototype,"_loadState",void 0),Ae([ft()],di.prototype,"_loadError",void 0),Ae([ft()],di.prototype,"_failure",void 0),Ae([ft()],di.prototype,"_stopError",void 0),Ae([ft()],di.prototype,"_turnOffError",void 0),Ae([ft()],di.prototype,"_showLastResult",void 0),Ae([ft()],di.prototype,"_readingSettings",void 0),Ae([ft()],di.prototype,"_readSettingsError",void 0),ae(oi,di);var ci=window.customCards=window.customCards||[];ci.some(t=>"apollo-radar-calibrate-card"===t.type)||ci.push({type:oi,name:"Apollo Radar Auto-Calibrate",description:"One-button empty-room calibration of every gate threshold on an Apollo MSR (LD2410) or R PRO (LD2412), with undo.",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"});var ui=/(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$/,hi=/(?:_ld2450)?_target_(\d+)_y(?:_\d+)?$/;function _i(t,e){for(const[n]of yt(t.entities,e))if(n.startsWith("sensor.")&&ui.test(n.slice(n.indexOf(".")+1)))return!0;return!1}function pi(t){try{const e=t();e&&"function"==typeof e.catch&&e.catch(()=>{})}catch{}}var vi=class{constructor(t){this._activity="unknown",this._unsubscribe=null,this._serial=0,this._pending=!1,this._retryTimer=null,this._retryIndex=0,this._refused=!1,this._onReady=()=>this._reopen(),this._onDisconnected=()=>this._cancelRetry(),this._entryFeed=null,this._entryFeedSerial=0,this._onChange=t}get activity(){return this._activity}watch(t,e){var n;const i=null==t?void 0:t.connection;(null==i?void 0:i.subscribeMessage)&&e?(e===this._deviceId&&i===(null===(n=this._api)||void 0===n?void 0:n.connection)||(this.close(),this._api={connection:i},this._deviceId=e),this._listen(i),this._openEntryFeed(i),this._open()):this.close()}close(){this._retryIndex=0,this._closeFeed(),this._unlisten(),this._closeEntryFeed(),this._api=void 0,this._deviceId=void 0,this._set("unknown")}_set(t){t!==this._activity&&(this._activity=t,this._onChange())}_open(){const t=this._api,e=this._deviceId;if(!t||!e||this._unsubscribe||this._pending||this._retryTimer)return;if(this._refused)return;const n=++this._serial;this._pending=!0,Oe(t,e,t=>{n===this._serial&&this._set(function(t){var e;const n=null==t?void 0:t.job;return n?Qe(n.status)&&(null==t||null===(e=t.last_result)||void 0===e?void 0:e.job_id)===n.job_id?"idle":"running":"idle"}(t))}).then(t=>{n===this._serial?(this._pending=!1,this._unsubscribe=t,this._retryIndex=0):pi(t)},t=>{if(n!==this._serial)return;if(this._pending=!1,this._set("idle"),"not_loaded"!==(null==t?void 0:t.code)||this._retryIndex>=Ie.length)return void(this._refused=!0);const e=Ie[this._retryIndex];this._retryIndex+=1,this._retryTimer=setTimeout(()=>{this._retryTimer=null,this._open()},e)})}_closeFeed(){this._serial+=1,this._pending=!1,this._refused=!1,this._cancelRetry();const t=this._unsubscribe;this._unsubscribe=null,t&&pi(t)}_reopen(){this._retryIndex=0,this._closeFeed(),this._open()}_cancelRetry(){null!==this._retryTimer&&(clearTimeout(this._retryTimer),this._retryTimer=null)}_listen(t){t!==this._listened&&(this._unlisten(),t.addEventListener&&(t.addEventListener("ready",this._onReady),t.addEventListener("disconnected",this._onDisconnected),this._listened=t))}_unlisten(){const t=this._listened;this._listened=void 0,(null==t?void 0:t.removeEventListener)&&(t.removeEventListener("ready",this._onReady),t.removeEventListener("disconnected",this._onDisconnected))}_openEntryFeed(t){const e=this._api;if(!e||this._entryFeedConnection===t)return;this._closeEntryFeed(),this._entryFeedConnection=t;const n=++this._entryFeedSerial;Fe(e,()=>{n===this._entryFeedSerial&&this._reopen()}).then(t=>{n===this._entryFeedSerial?this._entryFeed=t:t&&pi(t)})}_closeEntryFeed(){this._entryFeedSerial+=1,this._entryFeedConnection=void 0;const t=this._entryFeed;this._entryFeed=null,t&&pi(t)}};function fi(t,e){return`Apollo mmWave was updated to ${t}, but this page still runs ${e}.`}function gi(t,e){return`Apollo mmWave ${e} is installed, but Home Assistant still runs ${t}. Restart Home Assistant to finish updating.`}var mi,yi,$i,bi={a:0,b:1,rc:2},wi=/^(\d+)\.(\d+)\.(\d+)(?:(a|b|rc)(\d+))?$/;function xi(t){if("string"!=typeof t)return;const e=wi.exec(t.trim());if(!e)return;const n=void 0===e[4]?3:bi[e[4]];return[Number(e[1]),Number(e[2]),Number(e[3]),n,Number(e[5]??0)]}function ki(t,e){const n=xi(t),i=xi(e);if(n&&i){for(let t=0;t<n.length;t++)if(n[t]!==i[t])return n[t]-i[t];return 0}}var Si,Ti=0,zi=0,Ri=!1;async function Ai(){const t=$i,n=++Ti;let i;try{if("function"==typeof(null==t?void 0:t.callWS)){const e=await t.callWS({type:"manifest/get",integration:"apollo_mmwave"});i=null==e?void 0:e.version}}catch{i=void 0}if(n!==Ti)return;const s=function(t,e,n){if("string"!=typeof t)return;const i=ki(e,t);if(void 0===i||0===i)return;const s=void 0!==n&&0!==(ki(n,t)??0);return i>0&&!s?{kind:"restart",lines:[gi(t,e)]}:{kind:"reload",lines:[fi(t,e),"In the Home Assistant app, if Reload does not help, close the app fully and open it again."]}}(i,e,yi);void 0===yi&&"string"==typeof i&&xi(i)&&(yi=i),JSON.stringify(s)!==JSON.stringify(mi)&&(mi=s,Ii())}function Ei(){const t=Si;Si=void 0;try{var e,n;null==t||null===(n=(e=t.connection).removeEventListener)||void 0===n||n.call(e,"ready",t.listener)}catch{}}var Ci=Symbol.for("apollo_mmwave.version_notice.v1");function Mi(){const t=globalThis;return Array.isArray(t[Ci])||(t[Ci]=[]),t[Ci]}function Ii(){for(const t of[...Mi()])try{t.changed()}catch{}}function Li(t){const e={own:()=>mi,changed:t};let n=!0;return Mi().push(e),zi++,{get notice(){if(n)for(const t of Mi()){if(t===e)return mi;try{if(t.own())return}catch{}}},update(t){n&&function(t){if(!t)return;$i=t;const e=t.connection;if(e&&"object"==typeof e){if((null==Si?void 0:Si.connection)===e)return;Ei();const t=()=>{Ai()};Si={connection:e,listener:t};try{var n;null===(n=e.addEventListener)||void 0===n||n.call(e,"ready",t)}catch{}Ai()}else Si||Ri||(Ri=!0,Ai())}(t)},close(){if(!n)return;n=!1,0===--zi&&Ei();const t=Mi(),i=t.indexOf(e);i>=0&&t.splice(i,1),Ii()}}}var Di,Pi="apollo_mmwave",Oi="(?:_\\d+)?$",Fi=/(?:^|_)(?:ld2410|ld2412)$/,Ni=/(?:^|_)zone_\d+$/,Ui=t=>({re:new RegExp(`(?:^|_)ld2450_${t}${Oi}`),notAfter:[]}),ji=(t,e=[Fi])=>({re:new RegExp(`(?:^|_)${t}${Oi}`),notAfter:e}),Bi=(t,e,n)=>({slot:{kind:"scalar",key:t},domain:e,spellings:n}),Hi=t=>[Ui(t),ji(t)],Zi=t=>[Ui(t),ji(t,[Fi,Ni])],Gi=[Bi("zone_type","select",Hi("zone_type")),Bi("multi_target_tracking","switch",Hi("multi_target_tracking")),Bi("timeout","number",Hi("timeout")),Bi("bluetooth","switch",[Ui("bluetooth")]),Bi("restart","button",[Ui("restart")]),Bi("factory_reset","button",[Ui("factory_reset"),(Di="factory_reset_ld2450",{re:new RegExp(`(?:^|_)${Di}${Oi}`),notAfter:[]})]),Bi("presence","binary_sensor",[Ui("presence")]),Bi("moving_target","binary_sensor",[Ui("moving_target")]),Bi("still_target","binary_sensor",[Ui("still_target")]),Bi("presence_target_count","sensor",Hi("presence_target_count")),Bi("still_target_count","sensor",Zi("still_target_count")),Bi("moving_target_count","sensor",Zi("moving_target_count"))];for(let No=1;No<=3;No++)for(const t of["distance","direction","speed"])Gi.push({slot:{kind:"target",index:No-1,key:t},domain:"sensor",spellings:Hi(`target_${No}_${t}`)});for(let No=1;No<=3;No++){for(const t of["x1","y1","x2","y2"])Gi.push({slot:{kind:"zone",index:No-1,key:t},domain:"number",spellings:Hi(`zone_${No}_${t}`)});for(const t of["all","still","moving"])Gi.push({slot:{kind:"zone",index:No-1,key:`${t}_target_count`},domain:"sensor",spellings:Hi(`zone_${No}_${t}_target_count`)})}function Wi(t,e,n){for(let i=0;i<e.length;i++){const{re:s,notAfter:o}=e[i],r=s.exec(t);if(r){if(n){if(0!==r.index)continue}else{const e=t.slice(0,r.index);if(o.some(t=>t.test(e)))continue}return i}}return-1}function qi(t,e,n){const i=[];for(const s of Gi){if(s.domain!==t)continue;const o=Wi(e,s.spellings,n);o>=0&&i.push([s,o])}return i}function Ji(t,e,n){"scalar"===e.kind?t[e.key]=n:"target"===e.kind?t.targets[e.index][e.key]=n:t.zones[e.index][e.key]=n}var Vi=/* @__PURE__ */new WeakMap;function Ki(t,e){let n=Vi.get(t.entities);n||(n=/* @__PURE__ */new Map,Vi.set(t.entities,n));const i=n.get(e);if(i)return i;const s={targets:Array.from({length:3},()=>({})),zones:Array.from({length:3},()=>({}))},o=/* @__PURE__ */new Map,r=It(t,e);for(const[a,l]of yt(t.entities,e)){if(l.platform===Pi)continue;const t=a.indexOf("."),e=a.slice(0,t),n=a.slice(t+1),i=void 0!==r&&n.startsWith(`${r}_`)?n.slice(r.length+1):void 0;let d=void 0!==i?qi(e,i,!0):[];0===d.length&&(d=qi(e,n,!1));for(const[r,l]of d){const t=o.get(r);void 0!==t&&t<=l||(o.set(r,l),Ji(s,r.slot,a))}}return n.set(e,s),s}function Xi(t){return t.zones.flatMap(t=>[t.x1,t.y1,t.x2,t.y2]).filter(t=>void 0!==t)}var Yi=/^binary_sensor\..+_zone_(\d+)_presence(?:_\d+)?$/;function Qi(t){const e=Yi.exec(t);return e?parseInt(e[1],10):Number.POSITIVE_INFINITY}function ts(t,e){const n=[];for(const[i,s]of yt(t.entities,e))i.startsWith("binary_sensor.")&&(s.platform===Pi||!s.platform&&Yi.test(i))&&n.push(i);return n.sort((t,e)=>{const n=Qi(t),i=Qi(e);return n===i?0:n<i?-1:1})}function es(t){return void 0!==t&&"unavailable"!==t.state}function ns(t){return es(t)&&"unknown"!==t.state}function is(t,e){var n;const i=e.zone_type,s=i?t.states[i]:void 0;if(!i||!es(s))return;const o=s.state;if("Disabled"===o||"unknown"===o)return;const r=null===(n=s.attributes)||void 0===n?void 0:n.options,a={setting:"zone_type",name:"Zone Type",entityId:i,fix:Array.isArray(r)&&!r.includes("Disabled")?void 0:{domain:"select",service:"select_option",data:{entity_id:i,option:"Disabled"},label:"Set Zone Type to Disabled",clause:"sets Zone Type to Disabled",progress:"Setting Zone Type to Disabled..."}};if("Detection"===o){const n=function(t,e){const n=Xi(e);return 0!==n.length&&n.every(e=>{var n;const i=null===(n=t.states[e])||void 0===n?void 0:n.state;return void 0!==i&&""!==i.trim()&&0===Number(i)})}(t,e)?"None are set, so it reports nobody and the zone map stays empty.":"Anyone outside them is missing from the zone map.";return{...a,level:"warning",text:`Zone Type is Detection. This radar only reports people inside its built-in zones. ${n}`,hint:"Zone Type should be Disabled. The zone map replaces the radar's built-in zones."}}return"Filter"===o?{...a,level:"note",text:"Zone Type is Filter. This radar ignores people inside its built-in zones. Disabled is recommended because the zone map replaces them."}:{...a,level:"note",text:`Zone Type is ${o}. Disabled is recommended because the zone map replaces the radar's built-in zones.`}}function ss(t,e){var n;const i=e.multi_target_tracking;if(i&&"off"===(null===(n=t.states[i])||void 0===n?void 0:n.state))return{setting:"multi_target_tracking",name:"Multi Target Tracking",entityId:i,level:"warning",text:"Multi Target Tracking is off. Only one person is tracked.",fix:{domain:"switch",service:"turn_on",data:{entity_id:i},label:"Turn on Multi Target Tracking",clause:"turns on Multi Target Tracking",progress:"Turning on Multi Target Tracking..."}}}var os="After the change, automations and templates that use these sensors read mm.",rs=Object.freeze({in:"inches",cm:"centimeters",m:"meters",ft:"feet",yd:"yards",km:"kilometers",mi:"miles",nmi:"nautical miles"});var as=["Start Zone 1","End Zone 1","End Zone 2","End Zone 3"];function ls(t){return String(Number(t.toFixed(2)))}function ds(t){return t.length<3?t.join(" and "):`${t.slice(0,-1).join(", ")}, and ${t[t.length-1]}`}function cs(t){return[...t.move_threshold,...t.still_threshold].filter(t=>!!t)}function us(t){return[t.zone_1_start,t.end_zone_1,t.end_zone_2,t.end_zone_3]}function hs(t,e){return[t.engineering_mode,t.query_params,...cs(t),t.max_move_distance,t.max_still_distance,t.radar_timeout,..."ld2410"===e.key?us(t):[]].filter(t=>!!t)}function _s(t,e,n){var i;const s=e.engineering_mode;if(s&&"idle"===n&&"on"===(null===(i=t.states[s])||void 0===i?void 0:i.state))return{setting:"engineering_mode",name:"Radar Engineering Mode",entityId:s,level:"note",text:"Radar Engineering Mode is on, so every gate's energy is saved to the database about once a second.",hint:"Turn it off when you finish tuning. The Gate Energy chart needs it only while you watch it.",fix:{domain:"switch",service:"turn_off",data:{entity_id:s},label:"Turn off Radar Engineering Mode",clause:"turns off Radar Engineering Mode",progress:"Turning off Radar Engineering Mode...",failure:"Could not turn Radar Engineering Mode off"}}}function ps(t,e){const n=e=>{var n;return!!e&&"unknown"===(null===(n=t.states[e])||void 0===n?void 0:n.state)},i=[["gate thresholds",cs(e)],["detection range",[e.max_move_distance,e.max_still_distance]],["timeout",[e.radar_timeout]]],s=i.filter(([,t])=>t.some(n)).map(([t])=>t);if(0===s.length)return;const o=i.flatMap(([,t])=>t).find(n),r=e.query_params&&es(t.states[e.query_params])?e.query_params:void 0;return{setting:"settings_unread",name:"the radar's settings",entityId:o,level:"note",text:`The radar has not reported its ${ds(s)} yet, so those settings are blank.`,hint:r?"This only asks the radar to send them. Nothing on the radar changes.":"Press Query Params on the radar's device page to make it send them.",fix:r?{domain:"button",service:"press",data:{entity_id:r},label:Ke,clause:"asks the radar for its settings",progress:Xe,failure:"Could not ask the radar for its settings",settleMs:3e3,noAnswer:"The radar has not sent its settings yet. Try again in a moment."}:void 0}}function vs(t,e,n){const i=function(t,e){return us(e).map((e,n)=>{const i=_e(t,e);if(!e||void 0===i)return;const s=pe(t,e,"cm");return{entityId:e,label:as[n],cm:he(i,s,"cm"),text:`${ls(i)} ${s}`,unit:s}})}(t,e),s=[],o=/* @__PURE__ */new Set,r=[];for(let c=1;c<=3;c++){const t=i[c-1],e=i[c];t&&e&&((1===c?t.cm>e.cm:e.cm<=t.cm)&&(o.add(c),r.push({entityId:e.entityId,line:1===c?`Zone 1 can never turn on. ${t.label} (${t.text}) must be smaller than ${e.label} (${e.text}).`:`Zone ${c} can never turn on. ${e.label} (${e.text}) must be larger than ${t.label} (${t.text}).`})))}r.length&&s.push({setting:"zone_order",name:"the zone distances",entityId:r[0].entityId,level:"warning",text:r.map(t=>t.line).join(" "),hint:"Each zone starts where the one before it ends. Change the distances on the Zone Config card."});const a=function(t,e){var n;const i=[_e(t,e.max_move_distance),_e(t,e.max_still_distance)].filter(t=>void 0!==t);if(0===i.length)return;const s=ve(e.gate_size?null===(n=t.states[e.gate_size])||void 0===n?void 0:n.state:void 0),o=void 0!==s&&s>0?s:.75;return Math.max(...i)*o*100}(t,e);if(void 0===a)return s;const l=t=>`about ${ls(he(a,"cm",t))} ${t}`,d=[];for(let c=1;c<=3;c++){const t=i[c-1],e=i[c];!o.has(c)&&e&&(t&&t.cm>=a?d.push({entityId:t.entityId,line:`Zone ${c} starts at ${t.text}, past the radar's reach of ${l(t.unit)}, so it can never turn on.`,never:!0}):e.cm>a&&d.push({entityId:e.entityId,line:`Zone ${c} ends at ${e.text}, past the radar's reach of ${l(e.unit)}.`,never:!1}))}if(d.length){const[t,e]=n.rangeLabels;s.push({setting:"zone_reach",name:"the zone distances",entityId:d[0].entityId,level:d.some(t=>t.never)?"warning":"note",text:d.map(t=>t.line).join(" "),hint:`The reach comes from ${t} and ${e}. Lower the zone distances, or raise those gates on the Detection Range card.`})}return s}function fs(t,e,n){const i=_e(t,e.max_move_distance),s=_e(t,e.max_still_distance);if(void 0===i||void 0===s||s<i)return;const[o,r]=n.rangeLabels,a=`The ${n.label} only detects people from ${r} out to ${o}`;return{setting:"gate_range",name:r,entityId:e.max_still_distance,level:"warning",text:s>i?`${r} (${ls(s)}) is above ${o} (${ls(i)}). ${a}, so it may never see anyone.`:`${r} and ${o} are both ${ls(s)}. ${a}, so it covers one narrow band.`,hint:`Set ${r} lower than ${o} on the Detection Range card.`}}var gs="apollo-radar-setup-card";async function ms(t,e){var n;return"not_found"===((null==e?void 0:e.code)??(null==e||null===(n=e.error)||void 0===n?void 0:n.code))?"Home Assistant could not find this setting. Reload the page and try again.":We(t,e)}var ys=class extends ut{constructor(...t){super(...t),this._unitsBusy=!1,this._serial=0,this._jobWatch=new vi(()=>this.requestUpdate()),this._unitsRead=0}setConfig(t){this._config=t,this._radarConfig={type:t.type,...t.device_id?{device_id:t.device_id}:{}}}getCardSize(){return 2}static getStubConfig(t){const e=`custom:${gs}`;if(!t)return{type:e};const n=Object.keys(t.devices??{}),i=n.find(e=>_i(t,e));if(i)return{type:e,device_id:i};const s=n.find(e=>void 0!==jt(t,e));return s?{type:e,device_id:s,radar:"gate"}:{type:e}}connectedCallback(){super.connectedCallback(),this._watchJobs();const t=Li(()=>{this._version===t&&(this._versionNotice=t.notice)});this._version=t,t.update(this.hass),this._versionNotice=t.notice,this._unitsReadFor=void 0,this._watchUnits()}disconnectedCallback(){var t;super.disconnectedCallback(),this._jobWatch.close(),this._endSettling(!1),null===(t=this._version)||void 0===t||t.close(),this._version=void 0,this._versionNotice=void 0}_isGate(){var t;return"gate"===(null===(t=this._config)||void 0===t?void 0:t.radar)}_resolve(){if(this._isGate()&&this.hass&&this._radarConfig)return this._resolved=Qt(this._resolved,this.hass,this._radarConfig),this._resolved}_watchJobs(){var t;this.isConnected&&this._isGate()?this._jobWatch.watch(this.hass,null===(t=this._config)||void 0===t?void 0:t.device_id):this._jobWatch.close()}_status(){var t;const e=null===(t=this._config)||void 0===t?void 0:t.device_id,n=this._resolve();return n?function(t,e,n,i,s){if(!e)return{kind:"no_device"};const o=i?hs(n,i):[];if(!i||0===o.length)return{kind:"nothing_to_check"};const r=o.map(e=>t.states[e]);if(!r.some(es))return{kind:"offline"};const a=[_s(t,n,s),ps(t,n),..."ld2410"===i.key?vs(t,n,i):[fs(t,n,i)]].filter(t=>void 0!==t);if(a.length)return{kind:"checked",problems:a};const l=n.engineering_mode?t.states[n.engineering_mode]:void 0;return"unknown"===s&&"on"===(null==l?void 0:l.state)?{kind:"checking"}:r.some(ns)?{kind:"checked",problems:a}:{kind:"waiting"}}(this.hass,e,n.map,n.profile,this._jobWatch.activity):function(t,e){if(!e)return{kind:"no_device"};const n=Ki(t,e),i=[n.zone_type,n.multi_target_tracking].filter(t=>void 0!==t);if(0===i.length)return{kind:"nothing_to_check"};const s=i.map(e=>t.states[e]);if(!s.some(es))return{kind:"offline"};if(!s.some(ns))return{kind:"waiting"};const o=[is(t,n),ss(t,n)].filter(t=>void 0!==t);return void 0===n.zone_type||ns(t.states[n.zone_type])?{kind:"checked",problems:o}:o.length?{kind:"checked",problems:o,zoneTypeUnread:!0}:{kind:"waiting"}}(this.hass,e)}_watchUnits(){var t,e;const n=this.hass,i=null===(t=this._config)||void 0===t?void 0:t.device_id;if(!n||!i||this._isGate()||!0!==(null===(e=n.user)||void 0===e?void 0:e.is_admin)||"function"!=typeof n.callWS)return this._unitsReadFor=void 0,void(this._unitRows=void 0);const s=this._unitsReadFor;s&&s.deviceId===i&&s.entities===n.entities||(this._unitsReadFor={deviceId:i,entities:n.entities},this._readUnits())}async _readUnits(){var t;const e=this.hass,n=null===(t=this._config)||void 0===t?void 0:t.device_id;if(!(null==e?void 0:e.callWS)||!n)return;const i=++this._unitsRead;try{var s;const t=await e.callWS({type:"apollo_mmwave/target_units/get",device_id:n});if(i!==this._unitsRead||(null===(s=this._config)||void 0===s?void 0:s.device_id)!==n)return;this._unitRows=Array.isArray(null==t?void 0:t.targets)?t.targets:void 0}catch{var o;i===this._unitsRead&&(null===(o=this._config)||void 0===o?void 0:o.device_id)===n&&(this._unitRows=void 0)}}async _showInMm(){var t;const e=this.hass,n=null===(t=this._config)||void 0===t?void 0:t.device_id;if(!(null==e?void 0:e.callWS)||!n||this._unitsBusy)return;const i=this._serial;this._unitsBusy=!0,this._unitsError=void 0;try{await e.callWS({type:"apollo_mmwave/target_units/set",device_id:n}),i===this._serial&&await this._readUnits()}catch(s){const t=await async function(t,e){var n;const i=(null==e?void 0:e.code)??(null==e||null===(n=e.error)||void 0===n?void 0:n.code);return"not_loaded"===i?"Apollo mmWave is not loaded. Reload the page and try again.":"not_found"===i?De:We(t,e)}(e,s);i===this._serial&&(this._unitsError=`Could not change the Target X and Y units: ${t}`)}finally{i===this._serial&&(this._unitsBusy=!1)}}_watchedIds(){var t;const e=this._resolve();return e?(n=e.map,(i=e.profile)?[...hs(n,i),n.gate_size].filter(t=>!!t):[]):function(t,e){if(!e)return[];const n=Ki(t,e);return[n.zone_type,n.multi_target_tracking,...Xi(n)].filter(t=>void 0!==t)}(this.hass,null===(t=this._config)||void 0===t?void 0:t.device_id);var n,i}shouldUpdate(t){if(1!==t.size||!t.has("hass"))return!0;const e=t.get("hass");return!(e&&this.hass&&this._config)||(e.entities!==this.hass.entities||e.devices!==this.hass.devices||e.connection!==this.hass.connection||this._watchedIds().some(t=>e.states[t]!==this.hass.states[t]))}willUpdate(t){var e;if(t.has("_config")||t.has("hass")){var n;const t=null===(n=this._config)||void 0===n?void 0:n.device_id;t!==this._deviceId&&(this._deviceId=t,this._serial++,this._endSettling(!1),this._busy=void 0,this._error=void 0,this._note=void 0,this._unitsBusy=!1,this._unitsError=void 0,this._unitRows=void 0),this._watchJobs(),this._watchUnits()}if(t.has("hass")&&(null===(e=this._version)||void 0===e||e.update(this.hass)),!this.hass)return;const i=this._problems(),s=t=>i.some(e=>e.setting===t);this._error&&!i.length&&(this._error=void 0),this._note&&!s(this._note.setting)&&(this._note=void 0),this._settling&&!this._settling.problems.some(t=>s(t.setting))&&this._endSettling(!1)}_problems(){if(!this.hass)return[];const t=this._status();return"checked"===t.kind?t.problems:[]}async _apply(t){const e=this.hass,n=t.filter(t=>t.fix);if(!(null==e?void 0:e.callService)||this._busy||0===n.length)return;const i=this._serial;this._error=void 0,this._note=void 0,this._busy=n.length>1?"Applying recommended settings...":n[0].fix.progress;const s=e,o=await Promise.allSettled(n.map(t=>Ne(s,t.fix.domain,t.fix.service,t.fix.data))),r=[];for(let d=0;d<o.length;d++){const t=o[d];if("rejected"===t.status){const i=n[d].fix.failure??`Could not change ${n[d].name}`;r.push(`${i}: ${await ms(e,t.reason)}`)}}if(i!==this._serial)return;this._error=r.length?r.join(" "):void 0;const a=n.filter((t,e)=>"fulfilled"===o[e].status&&void 0!==t.fix.settleMs),l=this._problems();if(a.some(t=>l.some(e=>e.setting===t.setting))){const t=Math.max(...a.map(t=>t.fix.settleMs));return void(this._settling={problems:a,timer:setTimeout(()=>{i===this._serial&&this._endSettling(!0)},t)})}this._busy=void 0}_endSettling(t){var e;const n=this._settling;if(!n)return;if(clearTimeout(n.timer),this._settling=void 0,this._busy=void 0,!t||!this.hass)return;const i=this._problems(),s=n.problems.find(t=>i.some(e=>e.setting===t.setting));(null==s||null===(e=s.fix)||void 0===e?void 0:e.noAnswer)&&(this._note={setting:s.setting,text:s.fix.noAnswer})}render(){if(!this.hass||!this._config)return J;const t=this._status();return G`
      <ha-card .header=${this._config.title??"Radar setup"}>
        <div class="wrap">
          ${this._renderSubtitle()} ${this._renderVersionNotice()} ${this._renderBody(t)}
          ${this._renderUnits(t)}
        </div>
      </ha-card>
    `}_renderVersionNotice(){const t=this._versionNotice;if(!t)return J;const[e,...n]=t.lines;return G`
      <div class="version-notice" role="status">
        <p>${e}</p>
        ${"reload"===t.kind?G`<div class="buttons">
              <button type="button" class="primary" @click=${()=>{window.location.reload()}}>
                ${"Reload"}
              </button>
            </div>`:J}
        ${n.map(t=>G`<p class="hint">${t}</p>`)}
      </div>
    `}_renderSubtitle(){var t,e,n;const i=null===(t=this._config)||void 0===t?void 0:t.device_id,s=i?null===(e=this.hass)||void 0===e?void 0:e.devices[i]:void 0,o=(null==s?void 0:s.name_by_user)||(null==s?void 0:s.name);if(!this._isGate())return o?G`<div class="subtitle">LD2450 · ${o}</div>`:J;const r=[null===(n=this._resolve())||void 0===n||null===(n=n.profile)||void 0===n?void 0:n.label,o].filter(Boolean).join(" · ");return r?G`<div class="subtitle">${r}</div>`:J}_renderBody(t){switch(t.kind){case"no_device":return G`<p class="hint">${"Add device_id to this card's configuration to check the radar's settings."}</p>`;case"nothing_to_check":{const t=this._isGate()?"This device has no gate radar settings to check.":"This device has no Zone Type or Multi Target Tracking setting to check.";return G`<p class="hint">${t}</p>`}case"offline":return G`<p class="hint">${"Radar is offline. Its settings are checked once it reconnects."}</p>`;case"waiting":return G`<p class="hint">${"Waiting for the radar to report its settings."}</p>`;case"checking":return G`<p class="hint">${"Checking the radar's settings..."}</p>`;case"checked":return t.problems.length?this._renderProblems(t.problems,!!t.zoneTypeUnread):G`<p class="ok">${"Radar settings look good."}</p>`}}_renderUnits(t){var e;if(this._isGate()||"no_device"===t.kind||"nothing_to_check"===t.kind)return J;if(!0!==(null===(e=this.hass)||void 0===e||null===(e=e.user)||void 0===e?void 0:e.is_admin))return J;const n=function(t){const e=function(t){return(t??[]).filter(t=>t.convertible&&!t.picked&&"mm"!==t.unit)}(t);if(0===e.length)return;const n=[...new Set(e.map(t=>String(t.unit)))].map(t=>Object.prototype.hasOwnProperty.call(rs,t)?rs[t]:t).join(" and "),i=e.some(t=>Array.isArray(t.used_by)&&t.used_by.length>0);return{text:`Home Assistant shows this radar's Target X and Y in ${n}. The zone map reads them either way. In mm they match the radar's built-in zone corners and Apollo's zone guides.`,hint:i?`${os} An automation or script uses them: check any number it compares them to.`:os}}(this._unitRows);return n?G`
      <div class="units">
        <p class="note">${n.text}</p>
        <p class="hint">${n.hint}</p>
        <div class="buttons">
          <button
            type="button"
            class="primary"
            ?disabled=${this._unitsBusy}
            @click=${()=>this._showInMm()}
          >
            ${"Show Target X and Y in mm"}
          </button>
        </div>
        <div class="status" aria-live="polite">
          ${this._unitsBusy?G`<p class="hint">${"Switching Target X and Y to mm..."}</p>`:J}
          ${this._unitsError?G`<p class="error">${this._unitsError}</p>`:J}
        </div>
      </div>
    `:J}_renderProblems(t,e){var n;const i=t.filter(t=>t.fix),s=!this._isGate()&&i.length>1,o=!!(null===(n=this.hass)||void 0===n?void 0:n.callService)&&!this._busy;return G`
      <div class="problems">
        ${t.map(t=>G`
            <div class="problem ${t.level}">
              <p class=${t.level}>${t.text}</p>
              ${t.hint?G`<p class="hint">${t.hint}</p>`:J}
              ${t.fix&&!s?G`<div class="buttons">
                    <button
                      type="button"
                      class="primary"
                      ?disabled=${!o}
                      @click=${()=>this._apply([t])}
                    >
                      ${t.fix.label}
                    </button>
                  </div>`:J}
            </div>
          `)}
        ${s?G`<div class="combined">
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
              <p class="hint">${function(t){const e=t.map(t=>t.clause).join(" and ");return`${e.charAt(0).toUpperCase()}${e.slice(1)}.`}(i.map(t=>t.fix))}</p>
            </div>`:J}
        ${e?G`<p class="hint">${"Waiting for the radar to report its Zone Type."}</p>`:J}
        <div class="status" aria-live="polite">
          ${this._busy?G`<p class="hint">${this._busy}</p>`:J}
          ${this._note?G`<p class="hint">${this._note.text}</p>`:J}
          ${this._error?G`<p class="error">${this._error}</p>`:J}
        </div>
      </div>
    `}};ys.styles=a`
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
    .version-notice {
      border-left: 4px solid var(--warning-color, #ff9800);
      padding: 4px 0 4px 12px;
      margin: 0 0 12px;
    }
    .version-notice p:last-child {
      margin-bottom: 0;
    }
    .problem + .problem,
    .units {
      border-top: 1px solid var(--divider-color, #e0e0e0);
      padding-top: 8px;
    }
    .units {
      margin-top: 8px;
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
  `,Ae([vt({attribute:!1})],ys.prototype,"hass",void 0),Ae([ft()],ys.prototype,"_config",void 0),Ae([ft()],ys.prototype,"_busy",void 0),Ae([ft()],ys.prototype,"_error",void 0),Ae([ft()],ys.prototype,"_note",void 0),Ae([ft()],ys.prototype,"_versionNotice",void 0),Ae([ft()],ys.prototype,"_unitRows",void 0),Ae([ft()],ys.prototype,"_unitsBusy",void 0),Ae([ft()],ys.prototype,"_unitsError",void 0),ae(gs,ys),le(gs,"Apollo Radar Setup","Checks an Apollo radar's settings and offers one-click fixes: the LD2450 on an R PRO-1 or MTR-1, or the gate radar on an MSR-1, MSR-2 or R PRO-1.");var $s,bs,ws="apollo-radar-slider-row",xs="apollo-radar-slider-lock-row",ks=3e5,Ss="Unlock",Ts=/* @__PURE__ */new Map,zs=-1/0,Rs=!1;function As(t){let e=Ts.get(t);return e||(e={unlocked:!1,deadline:0,drags:/* @__PURE__ */new Map,lastTry:-1/0,lastReminder:-1/0,listeners:/* @__PURE__ */new Set},Ts.set(t,e)),e}function Es(t,e){for(const n of[...t.listeners])n(e)}function Cs(t){clearTimeout(t.timer),t.timer=void 0,t.unlocked&&(t.unlocked=!1,Es(t,"lock"))}function Ms(t,e){e.deadline=Date.now()+ks,clearTimeout(e.timer),e.timer=setTimeout(()=>Is(t),ks)}function Is(t){const e=Ts.get(t);if(!(null==e?void 0:e.unlocked))return;const n=e.deadline-Date.now();if(n>0)return clearTimeout(e.timer),void(e.timer=setTimeout(()=>Is(t),n));e.drags.size>0||Cs(e)}function Ls(){for(const t of[...Ts.keys()])Is(t)}function Ds(t){for(const[e,n]of Ts){let i=!1;for(const[e,s]of n.drags)t(e,s)&&(n.drags.delete(e),i=!0);!i||n.drags.size>0||n.unlocked&&Date.now()>=n.deadline&&setTimeout(()=>Is(e),0)}}function Ps(t){Ds(e=>e===t.pointerId)}function Os(){Ds((t,e)=>"touch"!==e)}function Fs(){if("hidden"===document.visibilityState)for(const t of Ts.values())t.drags.clear();else Ls()}function Ns(){zs=Date.now()}function Us(){Rs||(Rs=!0,window.addEventListener("pointerup",Ps,{capture:!0,passive:!0}),window.addEventListener("pointercancel",Ps,{capture:!0,passive:!0}),window.addEventListener("contextmenu",Os,{capture:!0,passive:!0}),document.addEventListener("visibilitychange",Fs),window.addEventListener("pageshow",Ls),window.addEventListener("scroll",Ns,{passive:!0}))}function js(t){var e;return(null===(e=Ts.get(t))||void 0===e?void 0:e.unlocked)??!1}function Bs(t,e){const n=Ts.get(t);e?(null==n?void 0:n.listeners.size)&&(n.unlocked=!0,n.lastTry=-1/0,n.lastReminder=-1/0,Ms(t,n),Es(n,"lock")):n&&Cs(n)}function Hs(t,e){Us();const n=As(t);clearTimeout(n.leaveTimer),n.leaveTimer=void 0,n.listeners.add(e);let i=!0;return()=>{i&&(i=!1,n.listeners.delete(e),n.listeners.size>0||(clearTimeout(n.leaveTimer),n.leaveTimer=setTimeout(()=>{n.listeners.size>0||(Cs(n),Ts.get(t)===n&&Ts.delete(t))},2e3)))}}function Zs(t){if(!t)return!1;const{mode:e,min:n,max:i,step:s}=t.attributes;return"slider"===e||"auto"===e&&(Number(i)-Number(n))/Number(s)<=256}var Gs=/* @__PURE__ */new Set(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"]);function Ws(t){return t.composedPath().some(t=>t instanceof Element&&("ha-slider"===t.localName||"slider"===t.getAttribute("role")||"input"===t.localName&&"range"===t.type))}function qs(t){return`apollo-mmwave-sliders-${t}`}function Js(t,e,n){t.dispatchEvent(new CustomEvent(e,{bubbles:!0,composed:!0,detail:n}))}var Vs=class extends ut{constructor(...t){super(...t),this._nudge=!1,this._serial=0,this._keyCapture={handleEvent:t=>this._onKey(t),capture:!0},this._changeCapture={handleEvent:t=>this._onChange(t),capture:!0},this._downCapture={handleEvent:t=>this._onSliderDown(t),capture:!0}}setConfig(t){var e;if(!(null==t?void 0:t.entity)||!t.device_id)throw new Error("Apollo mmWave: a slider row needs entity and device_id.");const n=t.device_id!==(null===(e=this._config)||void 0===e?void 0:e.device_id);this._config=t,n&&this.isConnected&&this._watch(),this._buildRow()}connectedCallback(){super.connectedCallback(),this._watch()}disconnectedCallback(){var t;super.disconnectedCallback(),null===(t=this._unwatch)||void 0===t||t.call(this),this._unwatch=void 0,clearTimeout(this._nudgeTimer),this._nudge=!1,this._gesture=void 0}_watch(){var t;null===(t=this._unwatch)||void 0===t||t.call(this),this._unwatch=this._config?Hs(this._config.device_id,t=>{"lock"===t&&this.requestUpdate()}):void 0,this.requestUpdate()}async _buildRow(){const t=++this._serial,e=await function(){const t=window.loadCardHelpers;return"function"!=typeof t?Promise.resolve(void 0):(t!==$s&&($s=t,bs=Promise.resolve().then(()=>t()).catch(()=>{})),bs)}(),n=this._config;if(t!==this._serial||!n)return;const i={...n};delete i.type,delete i.device_id;let s=null;try{s=(null==e?void 0:e.createRowElement({color:"state",...i}))??null}catch{s=null}s&&(s.hass=this.hass),this._row=s}shouldUpdate(t){if(t.has("hass")&&this._row&&(this._row.hass=this.hass),1!==t.size||!t.has("hass"))return!0;const e=t.get("hass");if(!e||!this.hass||!this._config)return!0;const n=this._config.entity;return e.states[n]!==this.hass.states[n]||e.localize!==this.hass.localize}_locked(){var t;const e=this._config;return!!e&&!!this._row&&!js(e.device_id)&&Zs(null===(t=this.hass)||void 0===t?void 0:t.states[e.entity])}render(){if(!this._config)return J;const t=this._locked(),e=this._row?this._row:null===this._row?this._renderFallback():J;return G`
      <div
        class="row ${t?"locked":""} ${t&&this._nudge?"nudge":""}"
        @keydown=${this._keyCapture}
        @change=${this._changeCapture}
        @pointerdown=${this._downCapture}
      >
        <div class="native">${e}</div>
        ${t?G`<div
              class="shield"
              aria-hidden="true"
              @pointerdown=${this._onDown}
              @pointermove=${this._onMove}
              @pointercancel=${this._onCancel}
              @click=${this._onClick}
            ></div>`:J}
      </div>
    `}_renderFallback(){var t,e,n;const i=this._config,s=null===(t=this.hass)||void 0===t?void 0:t.states[i.entity],o=i.name??(null==s?void 0:s.attributes.friendly_name)??i.entity,r=s?(null===(e=(n=this.hass).formatEntityState)||void 0===e?void 0:e.call(n,s))??s.state:"";return G`<div class="fallback"><span>${o}</span><span>${r}</span></div>`}_inSliderZone(t){var e;const n=null===(e=this._row)||void 0===e||null===(e=e.shadowRoot)||void 0===e?void 0:e.querySelector("ha-slider");if(!n)return!0;const i=n.getBoundingClientRect();return!i.width||("rtl"===getComputedStyle(this).direction?t<=i.right+8:t>=i.left-8)}_onDown(t){!t.isPrimary||t.button>0||(this._gesture={id:t.pointerId,x:t.clientX,y:t.clientY,slider:this._inSliderZone(t.clientX),moved:!1})}_onMove(t){const e=this._gesture;if(!e||e.id!==t.pointerId||e.moved)return;if("touch"!==t.pointerType&&0===t.buttons)return void(this._gesture=void 0);const n=Math.abs(t.clientX-e.x),i=Math.abs(t.clientY-e.y);Math.max(n,i)<10||(e.moved=!0,e.slider&&n>i&&this._try(!1))}_onCancel(){this._gesture=void 0}_onClick(t){const e=this._gesture;if(this._gesture=void 0,(null==e?void 0:e.moved)||t.button>0)return;const n=this._config;var i;(e?e.slider:this._inSliderZone(t.clientX))?function(t=Date.now()){return t-zs<300}()||this._try(!1):(null===(i=this.hass)||void 0===i?void 0:i.states[n.entity])&&Js(this,"hass-more-info",{entityId:n.entity})}_onKey(t){Gs.has(t.key)&&this._locked()&&Ws(t)&&(t.preventDefault(),t.stopPropagation(),t.repeat||this._try(!0))}_onChange(t){const e=this._config;if(e&&Ws(t))return this._locked()?(t.stopPropagation(),void this._buildRow()):void function(t){const e=Ts.get(t);(null==e?void 0:e.unlocked)&&Ms(t,e)}(e.device_id)}_onSliderDown(t){const e=this._config;var n,i,s;!e||!t.isPrimary||t.button>0||this._locked()||!Ws(t)||(n=e.device_id,i=t.pointerId,s=t.pointerType,Us(),As(n).drags.set(i,s))}_try(t){var e;const n=this._config,i=null===(e=this.hass)||void 0===e?void 0:e.states[n.entity];if(!i||"unavailable"===i.state)return;const s=n.device_id,o=function(t,e=!1,n=Date.now()){const i=As(t),s=n-i.lastTry<=1e4;return i.lastTry=n,Es(i,"try"),(e||s)&&n-i.lastReminder>=4e3?(i.lastReminder=n,"remind"):"nudge"}(s,t);if(this._nudge=!0,clearTimeout(this._nudgeTimer),this._nudgeTimer=setTimeout(()=>this._nudge=!1,1200),Js(this,"haptic","remind"===o?"warning":"light"),"remind"===o){Js(this,"hass-notification",{id:qs(s),message:"These sliders are locked. Press Unlock above them to change one.",duration:6e3,action:{text:Ss,action:()=>Bs(s,!0)}})}}};Vs.styles=a`
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
  `,Ae([vt({attribute:!1})],Vs.prototype,"hass",void 0),Ae([ft()],Vs.prototype,"_config",void 0),Ae([ft()],Vs.prototype,"_row",void 0),Ae([ft()],Vs.prototype,"_nudge",void 0);var Ks=class extends ut{constructor(...t){super(...t),this._flash=""}setConfig(t){var e;if(!(null==t?void 0:t.device_id))throw new Error("Apollo mmWave: the slider lock row needs device_id.");const n=t.device_id!==(null===(e=this._config)||void 0===e?void 0:e.device_id);this._config=t,n&&this.isConnected&&this._watch()}connectedCallback(){super.connectedCallback(),this._watch()}disconnectedCallback(){var t;super.disconnectedCallback(),null===(t=this._unwatch)||void 0===t||t.call(this),this._unwatch=void 0,clearTimeout(this._flashTimer),this._flash=""}_watch(){var t;null===(t=this._unwatch)||void 0===t||t.call(this),this._unwatch=this._config?Hs(this._config.device_id,t=>{"lock"===t?this.requestUpdate():this._flashButton()}):void 0,this.requestUpdate()}_flashButton(){this._flash="flash-a"===this._flash?"flash-b":"flash-a",clearTimeout(this._flashTimer),this._flashTimer=setTimeout(()=>this._flash="",1200)}shouldUpdate(t){return 1!==t.size||!t.has("hass")}_toggle(){const t=this._config.device_id,e=!js(t);Bs(t,e);Js(this,"hass-notification",{id:qs(t),message:e?"Sliders unlocked. They lock again after 5 minutes without a change.":"Sliders locked."})}render(){if(!this._config)return J;const t=js(this._config.device_id);return G`
      <div class="lock ${t?"unlocked":""}">
        <div class="icon" aria-hidden="true">
          <ha-icon .icon=${t?"mdi:lock-open-variant":"mdi:lock"}></ha-icon>
        </div>
        <div class="info" id="state">
          <div>${t?"Sliders unlocked":"Sliders locked"}</div>
          <div class="secondary">${t?"They lock again after 5 minutes without a change.":"A scroll cannot move them."}</div>
        </div>
        <button type="button" class=${this._flash} aria-describedby="state" @click=${this._toggle}>
          ${t?"Lock":Ss}
        </button>
      </div>
    `}};function Xs(t,e){return t?[{entity:t,name:e}]:[]}function Ys(t,e){return t?[{entity:t,name:e,slider:!0}]:[]}function Qs(t,e,n,i){return t?[{entity:t,name:e,confirm:{text:n,action:i}}]:[]}function to(t,e){return Qs(t,"Factory Reset Radar",`Reset the ${e} radar to its factory settings? It restarts and forgets its own settings.`,"Reset")}function eo(t,e){return Qs(t,"Restart Radar",`Restart the ${e} radar? It stops detecting for a few seconds while it starts up.`,"Restart")}Ks.styles=a`
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
  `,Ae([vt({attribute:!1})],Ks.prototype,"hass",void 0),Ae([ft()],Ks.prototype,"_config",void 0),Ae([ft()],Ks.prototype,"_flash",void 0),ae(ws,Vs),ae(xs,Ks);var no="Radar Bluetooth (HLK app)";function io(t,e){if("ft"===e){const e=t/.3048;return`about ${e<3?Number(e.toFixed(1)):Math.round(e)} ft`}return`about ${Number(t.toFixed(t<1?2:1))} m`}function so(t,e){return e.filter(e=>Wt(t,e.entity))}function oo(t,e){const n=t.zones[e];return[...Xs(n.x1,"X1"),...Xs(n.y1,"Y1"),...Xs(n.x2,"X2"),...Xs(n.y2,"Y2"),...Xs(n.all_target_count,"Target Count"),...Xs(n.still_target_count,"Still Target Count"),...Xs(n.moving_target_count,"Moving Target Count")]}function ro(t){return void 0!==t&&"unavailable"!==t.state}function ao(t,e){return!!e&&ro(t.states[e])}function lo(t,e,n){const i=Bt(t,e),s=[];return i&&s.push(i.engineering_mode,i.radar_timeout,i.max_move_distance,i.max_still_distance,i.radar_target,i.moving_target,i.still_target,i.detection_distance,...i.move_threshold,...i.still_threshold,...i.move_energy,...i.still_energy),s.push(...function(t,e){const n=[];for(const[i]of yt(t.entities,e)){if(!i.startsWith("sensor."))continue;const t=i.slice(i.indexOf(".")+1);(ui.test(t)||hi.test(t))&&n.push(i)}return n}(t,e)),!!s.some(e=>ao(t,e))||!s.some(t=>void 0!==t)&&(n&&yt(t.entities,e).some(([e,n])=>"apollo_mmwave"!==n.platform&&ao(t,e)))}function co(t,e,n=!1){const i=t.devices[e];if(n&&!i)return;const s=function(t,e){let n=!1,i=!1;for(const[,s]of yt(t.entities,e))if(n=!0,void 0!==s.platform&&(i=!0,"esphome"===s.platform))return!0;return n&&!i}(t,e)?At(i):void 0,o=It(t,e);if(!n&&!s&&!o)return;const r=lo(t,e,!!s);if(!n&&!s&&!r)return;const a=jt(t,e)??(null==s?void 0:s.profile),l=_i(t,e)||((null==s?void 0:s.ld2450)??!1);return n||a||l?{deviceId:e,base:o??e,name:(null==i?void 0:i.name_by_user)||(null==i?void 0:i.name)||o||e,profile:a,ld2450:l,online:r}:void 0}function uo(t,e){var n;if(e.device_id){const n=co(t,e.device_id,!0);return n?[n]:[]}return(null===(n=e.devices)||void 0===n?void 0:n.length)?e.devices.map(e=>co(t,e,!0)).filter(t=>void 0!==t):function(t){const e=[];for(const n of Object.keys(t.devices)){const i=co(t,n);i&&e.push(i)}return e}(t)}function ho(t,e,n={},i){if(0!==e.length)return{type:"entities",title:t,show_header_toggle:!1,...n,entities:_o(e,i)}}function _o(t,e){const n=[];let i=!1;for(const s of t)e&&s.slider?(i||(n.push({type:`custom:${xs}`,device_id:e}),i=!0),n.push({type:`custom:${ws}`,entity:s.entity,name:s.name,device_id:e})):n.push(vo(s));return n}function po(t,e){return e.map(e=>{const n=t.states[e.entity];return e.slider&&void 0!==(null==n?void 0:n.attributes.mode)&&!Zs(n)?{entity:e.entity,name:e.name}:e})}function vo(t){return t.confirm?{type:"button",entity:t.entity,name:t.name,action_name:t.confirm.action,tap_action:{action:"perform-action",perform_action:"button.press",target:{entity_id:t.entity},confirmation:{text:t.confirm.text}}}:{entity:t.entity,name:t.name}}function fo(t,e){const n=function(t,e){const n=(i=t.name,i.replace(/[!-\/:-@\[-`{-~]/g,"\\$&"));var i;if(!t.profile&&!t.ld2450)return{type:"markdown",content:`**${n}**: no radar data available right now.\n\nThe device looks offline (or exposes no recognizable radar entities). Its cards will appear here once it reports in.\n\n`+go(t)};if(!t.profile||t.ld2450&&!e.gateRadar)return{type:"markdown",content:`**${n}**, Apollo mmWave (LD2450 tracking radar).\n\nDraw occupancy zones over the live target positions below.\n\n**Start here**\n${mo([...e.ld2450Setup?["Fix anything the Radar setup card flags."]:[],"Set **Cone rotation** (under Map settings on the zone map) to match how the sensor is mounted.","Press **Add zone** under the zone map and drag on the map to draw the zone. Reload this page, then walk into the zone and watch it turn on under Zone presence."])}\n\n${yo}\n\n`+go(t)};const s=t.profile,o=`[Full tuning guide →](${s.wikiUrl}) · ${go(t)}`;if(!t.ld2450)return{type:"markdown",content:`**${n}**, Apollo ${s.label} radar.\n\n**Start here**\n${mo(bo(s,e,!1))}\n\n`+(e.gatePresence?`${$o(e.anyZone)}\n\n`:"")+o};const r=e.ld2450Setup?"fix anything Radar setup flags above the zone map, ":"",a=e.gatePresence?`**In automations**, use **${s.label} Presence** (Radar Target on this tab) for the whole room, or a zone's presence sensor for one part of it.`:yo;return{type:"markdown",content:`**${n}**, Apollo mmWave with two radars. The **${s.label}** senses people anywhere in range, even sitting still. The **LD2450** tracks where people are and drives the zone map.\n\n**Start here**\n`+mo([...bo(s,e,!0),`For the LD2450, ${r}set **Cone rotation** (under Map settings on the zone map) to match how the sensor is mounted, then press **Add zone**, draw the zone and walk into it.`])+`\n\n${a}\n\n`+o}}(t,e);return t.online||!t.profile&&!t.ld2450||(n.content=`${n.content}\n\n**Offline right now.** Its entities are unavailable, so the cards below will fill in once it reconnects. If this radar was replaced or reflashed under a new name, delete the old device in Home Assistant to drop this tab.`),n}function go(t){return`[All settings for this device →](/config/devices/device/${encodeURIComponent(t.deviceId)})`}function mo(t){return t.map((t,e)=>`${e+1}. ${t}`).join("\n")}var yo="**In automations**, use a zone's presence sensor, or **LD2450 Presence** for anywhere the radar sees.";function $o(t){return"**In automations**, use **Radar Target** for the whole room. If it turns off while someone sits still, raise **Radar Timeout** to 60 s or more."+(t?" To ignore people past End Zone 3, use **Any zone** instead.":"")}function bo(t,e,n){const i=n?`the ${t.label}`:"it",s=n?`${t.label} presence`:"presence",o=n?`the ${t.label}'s Radar setup card`:"the Radar setup card";return[...e.gateSetup?[`Fix anything ${o} flags.`]:[],"Press **Calibrate with empty room** on the Auto-calibrate card and leave the room.",`Set how far ${i} should look: **${t.rangeLabels[0]} / ${t.rangeLabels[1]}** on the Detection Range card (each gate is ${e.gateDepth}).`,`Set how long ${s} stays on after you stop moving: **Radar Timeout**, same card.`,"Walk the room and watch the Gate Energy chart. Raise a gate's threshold if it triggers with nobody there, lower it if it misses you."]}function wo(t){return{type:"markdown",content:t}}var xo="Zone presence";var ko="Device";function So(t,e,n){const i=function(t,e){const n={};for(const[i,s]of yt(t.entities,e)){if("apollo_mmwave"===s.platform)continue;const t=i.indexOf("."),e=i.slice(0,t),o=i.slice(t+1);for(const s of qt)s.domain===e&&void 0===n[s.slot]&&s.re.test(o)&&(n[s.slot]=i)}return n}(t,e.deviceId),s=function(t,e){return t.profile&&e&&t.ld2450?{name:"Restart device (both radars)",text:"Restart the whole device? Both radars stop, and the device is offline for a short while before it reconnects."}:t.ld2450?{name:"Restart device (also restarts the radar)",text:"Restart the whole device? The radar restarts with it, and the device is offline for a short while before it reconnects."}:{name:"Restart device",text:"Restart the whole device? It is offline for a short while before it reconnects."}}(e,n),o=ho(ko,so(t,function(t,e){return[...Xs(t.apollo_firmware,"Apollo firmware"),...Xs(t.ld2410_firmware,"LD2410 firmware"),...Xs(t.ld2412_firmware,"LD2412 firmware"),...Xs(t.ld2450_firmware,"LD2450 firmware"),...Xs(t.update,"Firmware update"),...Qs(t.esp_reboot,e.name,e.text,"Restart")]}(i,s))),r=o?[o]:[];return Wt(t,i.rssi)&&r.push({type:"conditional",conditions:[{condition:"numeric_state",entity:i.rssi,below:-75}],card:{type:"markdown",content:"**Weak Wi-Fi.** The signal is below -75 dBm, so presence updates can lag or drop out. Move the device or your Wi-Fi router closer, or add an access point."}}),r.push({type:"markdown",...o?{}:{title:ko},content:`${go(e)}\n\n**Download a support file** for Apollo support: open [Apollo mmWave](/config/integrations/integration/apollo_mmwave), then pick **Download diagnostics** from the three dots menu.`}),1===r.length?r[0]:{type:"vertical-stack",cards:r}}function To(t,e,n,i){const s=function(t){var e;return"mi"===(null===(e=t.config)||void 0===e||null===(e=e.unit_system)||void 0===e?void 0:e.length)?"ft":"m"}(t);let o=.75,r=!1,a=!1,l=!1;const d={},c=!!e.profile&&e.ld2450,u=[];if(e.profile){const h=e.profile;d.calibrate={type:"custom:apollo-radar-calibrate-card",device_id:e.deviceId,device_base_name:e.base,title:"Auto-calibrate",...i?{calibration:i}:{}};const _=Bt(t,e.deviceId)??h.entityMap(e.base),p=h.label;d.gateSetup=hs(_,h).some(e=>Wt(t,e))?{type:"custom:apollo-radar-setup-card",device_id:e.deviceId,radar:"gate"}:void 0,o=function(t,e){var n;const i=ve(e.gate_size?null===(n=t.states[e.gate_size])||void 0===n?void 0:n.state:void 0);return void 0!==i&&i>0?i:.75}(t,_),r=Wt(t,_.radar_target),a=Wt(t,_.zone_occupancy),l=!!d.gateSetup||r;const v=t=>function(t,e,n){return 0===t?"G0 (at the sensor)":`G${t} (${io(t*e,n)})`}(t,o,s);u.push(...function(t,e){return[...Xs(t.radar_target,e?`${e} Presence`:"Detected"),...Xs(t.moving_target,e?`${e} Moving`:"Moving"),...Xs(t.still_target,e?`${e} Still`:"Still"),...Xs(t.zone_occupancy,"Any zone"),...Xs(t.zone_1_occupancy,"Zone 1"),...Xs(t.zone_2_occupancy,"Zone 2"),...Xs(t.zone_3_occupancy,"Zone 3")]}(_,c?p:void 0));const f=ho(`${p} Detection Range`,po(t,so(t,function(t,e,n){return[...Xs(t.radar_timeout,"Radar Timeout"),...Xs(t.gate_size,n),...Ys(t.max_move_distance,e[0]),...Ys(t.max_still_distance,e[1])]}(_,h.rangeLabels,h.gateSizeLabel))),{},e.deviceId),g=ho(`${p} Move Thresholds`,po(t,so(t,function(t,e=t=>`G${t}`){const n=[];for(let i=0;i<t.move_threshold.length;i++)n.push(...Ys(t.move_threshold[i],e(i)));return n}(_,v))),{},e.deviceId),m=ho(`${p} Still Thresholds`,po(t,so(t,function(t,e=t=>`G${t}`){const n=[];for(let i=0;i<t.still_threshold.length;i++)n.push(...Ys(t.still_threshold[i],e(i)));return n}(_,v))),{},e.deviceId);d.controls=ho(`${p} Controls`,so(t,function(t,e){return[...Xs(t.engineering_mode,"Radar Engineering Mode"),...Xs(t.background_correction,"Start Dynamic Background Correction"),...Xs(t.background_correction_status,"Background Correction Running"),...Xs(t.bluetooth,no),...eo(t.restart_radar,e),...to(t.factory_reset_radar,e)]}(_,p))),d.range=f,d.rangeNote=f?wo(h.rangeTip(io(o,s))):void 0,d.zone=ho(`${p} Zone Config`,so(t,function(t){return[...Xs(t.zone_1_start,"Start Zone 1"),...Xs(t.end_zone_1,"End Zone 1"),...Xs(t.end_zone_2,"End Zone 2"),...Xs(t.end_zone_3,"End Zone 3")]}(_))),d.zoneNote=d.zone?wo(function(t,e){return`💡 The boxes are in cm${"ft"===t?" (100 cm is about 3.3 ft)":""}. The zones sit back to back: Zone 1 runs from Start Zone 1 to End Zone 1, Zone 2 from there to End Zone 2, and Zone 3 from there to End Zone 3.`+(e?" **Any zone** is on while someone is in any of the three zones, so it ignores people past End Zone 3.":"")+" For the whole room, use **Radar Target** in automations: the zone sensors also need the radar's distance, which can read unknown while someone is there."}(s,a)):void 0,d.distance={type:"custom:apollo-radar-distance-card",device_id:e.deviceId,device_base_name:e.base,title:`${p} Distances`,...n?{distance_unit:n}:{}},d.gateEnergy={type:"custom:apollo-radar-gate-energy-card",device_id:e.deviceId,device_base_name:e.base,title:`${p} Gate Energy`},d.moveThr=g,d.stillThr=m,d.gateNote=g||m?wo(h.gateTip):void 0,d.occupancy=ho(`${p} Target / Occupancy`,so(t,function(t){return[...Xs(t.radar_target,"Radar Target"),...Xs(t.moving_target,"Radar Moving Target"),...Xs(t.still_target,"Radar Still Target"),...Xs(t.zone_1_occupancy,"Radar Zone 1 Occupancy"),...Xs(t.zone_2_occupancy,"Radar Zone 2 Occupancy"),...Xs(t.zone_3_occupancy,"Radar Zone 3 Occupancy"),...Xs(t.zone_occupancy,"Any zone")]}(_)),{state_color:!0})}if(e.ld2450){d.zoneHeader=e.profile?{type:"heading",heading:"Zone Map"}:void 0;const n=Ki(t,e.deviceId);d.ld2450Setup=Wt(t,n.zone_type)||Wt(t,n.multi_target_tracking)?{type:"custom:apollo-radar-setup-card",device_id:e.deviceId}:void 0,d.zoneMap=(h=e.deviceId,_=e.name,{type:"custom:apollo-radar-zone-map-card",device_id:h,title:_,unit_display:!0}),d.zonePresence=function(t,e){const n=ts(t,e).filter(e=>Wt(t,e));return 0===n.length?{type:"markdown",title:xo,content:"Press **Add zone** under the zone map to get a presence sensor for a zone. Reload this page to see it here."}:{type:"entities",title:xo,show_header_toggle:!1,state_color:!0,entities:n.map(t=>({type:"conditional",conditions:[{condition:"state",entity:t,state_not:"unavailable"}],row:{entity:t,state_color:!0}}))}}(t,e.deviceId),d.ld2450Live=ho("LD2450 Live",so(t,function(t){return[...Xs(t.presence,"LD2450 Presence"),...Xs(t.moving_target,"Moving Target"),...Xs(t.still_target,"Still Target"),...Xs(t.presence_target_count,"Target Count"),...t.targets.flatMap((t,e)=>[...Xs(t.distance,`Target ${e+1} Distance`),...Xs(t.direction,`Target ${e+1} Direction`)])]}(n)),{state_color:!0}),d.ld2450Controls=ho("LD2450 Controls",so(t,function(t){return[...Xs(t.zone_type,"Zone Type"),...Xs(t.multi_target_tracking,"Multi Target Tracking"),...Xs(t.timeout,"Radar Timeout"),...Xs(t.bluetooth,no),...eo(t.restart,"LD2450"),...to(t.factory_reset,"LD2450")]}(n))),d.ld2450ControlsNote=Wt(t,n.timeout)?wo("💡 **Radar Timeout** is how long LD2450 Presence stays on after the radar last sees someone. It does not hold the zones you draw: a zone turns off as soon as nobody is in it, unless you give it a **Hold** time under Zones on the zone map."):void 0,d.builtInZones=function(t,e){if(!Wt(t,e.zone_type))return;const n=[];for(let i=0;i<3;i++){const s=so(t,oo(e,i));0!==s.length&&n.push({type:"section",label:`Zone ${i+1}`},...s.map(t=>({entity:t.entity,name:t.name})))}return 0!==n.length?{type:"conditional",conditions:[{condition:"state",entity:e.zone_type,state_not:["Disabled","unavailable","unknown"]}],card:{type:"vertical-stack",cards:[{type:"markdown",title:"Radar's built-in zones",content:"These are the radar chip's own zones, not the ones on the zone map. Zone Type Disabled is recommended, because the zone map replaces them."},{type:"entities",show_header_toggle:!1,entities:n}]}}:void 0}(t,n),u.push(...function(t,e){return[...Xs(t.presence,"LD2450 Presence"),...e.map(t=>({entity:t}))]}(n,ts(t,e.deviceId)))}var h,_;return d.history=function(t,e){if(0!==e.length)return{type:"history-graph",title:t,hours_to_show:24,entities:e}}(e.profile&&!e.ld2450?`${e.profile.label} Occupancy History`:"Occupancy History",so(t,u)),d.help=fo(e,{gateDepth:io(o,s),gateSetup:!!d.gateSetup,ld2450Setup:!!d.ld2450Setup,gatePresence:r,anyZone:a,gateRadar:l}),d.device=So(t,e,l),d}function zo(t){return t?{...t,grid_options:{columns:"full"}}:void 0}function Ro(t,e,n,i){const s=To(t,e,n,i);let o;const r=[];s.zoneMap&&(e.profile?(o=[s.zoneHeader,zo(s.ld2450Setup),zo(s.zoneMap)],r.push(o,[s.zonePresence,s.ld2450Live,s.ld2450Controls,s.ld2450ControlsNote,s.builtInZones])):(o=[s.ld2450Setup?s.help:zo(s.help),s.ld2450Setup,zo(s.zoneMap)],r.push(o,[s.zonePresence,s.ld2450Live,s.history],[s.ld2450Controls,s.ld2450ControlsNote,s.builtInZones])));const a=[];if(e.profile){const t=[s.help,s.gateSetup,s.calibrate,s.controls,s.zone,s.zoneNote],e=[s.distance,s.range,s.rangeNote];(s.zone?e:t).push(s.occupancy),a.push(t,...r,e,[s.gateEnergy,s.moveThr,s.gateNote],[s.history,s.stillThr])}else s.zoneMap?a.push(...r):a.push([s.help]);const l=a.map(t=>({cards:t.filter(Boolean),wide:t===o})).filter(t=>t.cards.length>0);return l[l.length-1].cards.push(s.device),l.map(({cards:t,wide:e})=>({type:"grid",...e?{column_span:2}:{},cards:t}))}function Ao(t,e){const n=/* @__PURE__ */new Set;return uo(t,e).map(i=>{let s=i.base;return n.has(s)&&(s=`${i.base}_${i.deviceId}`),n.add(s),function(t,e,n,i=e.base,s){const o=Ro(t,e,n,s);return{title:e.name,path:i,type:"sections",...o.some(t=>t.column_span)?{dense_section_placement:!0}:{},sections:o}}(t,i,e.distance_unit,s,e.calibration)})}function Eo(t,e){return uo(t,e).flatMap(n=>Ro(t,n,e.distance_unit,e.calibration))}function Co(t,e){return uo(t,e).flatMap(n=>function(t,e,n,i){const s=To(t,e,n,i);return[s.help,s.gateSetup,s.calibrate,s.controls,s.range,s.rangeNote,s.zone,s.zoneNote,s.distance,s.gateEnergy,s.moveThr,s.stillThr,s.gateNote,s.occupancy,s.zoneHeader,s.ld2450Setup,s.zoneMap,s.zonePresence,s.ld2450Live,s.history,s.ld2450Controls,s.ld2450ControlsNote,s.builtInZones,s.device].filter(Boolean)}(t,n,e.distance_unit,e.calibration))}function Mo(t,e){return uo(t,e).map(t=>{var e;return JSON.stringify([t.deviceId,(null===(e=t.profile)||void 0===e?void 0:e.key)??"",t.ld2450,t.name,t.base])}).sort().join(",")}function Io(t,e,n){if(e.devices===n.devices&&e.entities===n.entities&&!function(t,e){for(const n in e.states){const i=e.states[n],s=t.states[n];if(s!==i&&ro(s)!==ro(i))return!0}return!1}(e,n))return!1;const i=function(t){const e=t.options;return 2===Object.keys(t).length&&"object"==typeof e&&null!==e}(t)?{...t,...t.options}:t;return Mo(e,i)!==Mo(n,i)}var Lo={title:"Apollo Radar Tuning",cards:[{type:"markdown",content:"No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), R PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant."}]},Do={title:"Apollo Radar Tuning",cards:[{type:"markdown",content:"The dashboard's device selection points at devices that no longer exist in Home Assistant. Open Settings > Devices & Services > Apollo mmWave > Configure and clear or update Dashboard devices (leave it empty to show every Apollo mmWave device automatically)."}]},Po=class extends HTMLElement{static async generate(t,e){return{type:"sections",sections:Eo(e,t)}}};Po.shouldRegenerate=Io;var Oo=class extends HTMLElement{static async generate(t,e){var n;const i=Ao(e,t),s=(null===(n=t.devices)||void 0===n?void 0:n.length)||t.device_id?Do:Lo;return{title:"Apollo Radar Tuning",views:i.length?i:[s]}}};Oo.shouldRegenerate=Io;var Fo=class extends HTMLElement{static async generate(t,e){return{type:"grid",cards:Co(e,t)}}};Fo.shouldRegenerate=Io,ae("ll-strategy-view-apollo-radar-tuning",Po),ae("ll-strategy-section-apollo-radar-tuning",Fo),ae("ll-strategy-dashboard-apollo-radar-tuning",Oo),window.customStrategies=window.customStrategies||[],window.customStrategies.some(t=>"apollo-radar-tuning"===t.type)||window.customStrategies.push({type:"apollo-radar-tuning",strategyType:"dashboard",name:"Apollo Radar Tuning",description:"Auto-built tuning dashboard for Apollo radar devices (MSR / LD2410, R PRO / LD2412 + LD2450, MTR-1 / LD2450).",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"}),console.info(`%c APOLLO-MMWAVE %c v${e} `,"color:#fff;background:#03a9f4;font-weight:700;","color:#03a9f4;background:#fff;font-weight:700;");export{e as CARD_VERSION};