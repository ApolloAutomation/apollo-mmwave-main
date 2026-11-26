var e,t="2.5.1",n=globalThis,i=n.ShadowRoot&&(void 0===n.ShadyCSS||n.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,o=Symbol(),s=/* @__PURE__ */new WeakMap,r=class{constructor(e,t,n){if(this._$cssResult$=!0,n!==o)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(i&&void 0===e){const n=void 0!==t&&1===t.length;n&&(e=s.get(t)),void 0===e&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),n&&s.set(t,e))}return e}toString(){return this.cssText}},a=(e,...t)=>{const n=1===e.length?e[0]:t.reduce((t,n,i)=>t+(e=>{if(!0===e._$cssResult$)return e.cssText;if("number"==typeof e)return e;throw Error("Value passed to 'css' function must be a 'css' function result: "+e+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+e[i+1],e[0]);return new r(n,e,o)},l=i?e=>e:e=>e instanceof CSSStyleSheet?(e=>{let t="";for(const n of e.cssRules)t+=n.cssText;return(e=>new r("string"==typeof e?e:e+"",void 0,o))(t)})(e):e,{is:d,defineProperty:c,getOwnPropertyDescriptor:u,getOwnPropertyNames:h,getOwnPropertySymbols:_,getPrototypeOf:p}=Object,v=globalThis,f=v.trustedTypes,g=f?f.emptyScript:"",m=v.reactiveElementPolyfillSupport,y=(e,t)=>e,$={toAttribute(e,t){switch(t){case Boolean:e=e?g:null;break;case Object:case Array:e=null==e?e:JSON.stringify(e)}return e},fromAttribute(e,t){let n=e;switch(t){case Boolean:n=null!==e;break;case Number:n=null===e?null:Number(e);break;case Object:case Array:try{n=JSON.parse(e)}catch(e){n=null}}return n}},b=(e,t)=>!d(e,t),w={attribute:!0,type:String,converter:$,reflect:!1,useDefault:!1,hasChanged:b};
/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/(e=Symbol).metadata??(e.metadata=Symbol("metadata")),v.litPropertyMetadata??(v.litPropertyMetadata=/* @__PURE__ */new WeakMap);var x=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=w){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const n=Symbol(),i=this.getPropertyDescriptor(e,n,t);void 0!==i&&c(this.prototype,e,i)}}static getPropertyDescriptor(e,t,n){const{get:i,set:o}=u(this.prototype,e)??{get(){return this[t]},set(e){this[t]=e}};return{get:i,set(t){const s=null==i?void 0:i.call(this);null==o||o.call(this,t),this.requestUpdate(e,s,n)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??w}static _$Ei(){if(this.hasOwnProperty(y("elementProperties")))return;const e=p(this);e.finalize(),void 0!==e.l&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(y("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(y("properties"))){const e=this.properties,t=[...h(e),..._(e)];for(const n of t)this.createProperty(n,e[n])}const e=this[Symbol.metadata];if(null!==e){const t=litPropertyMetadata.get(e);if(void 0!==t)for(const[e,n]of t)this.elementProperties.set(e,n)}this._$Eh=/* @__PURE__ */new Map;for(const[t,n]of this.elementProperties){const e=this._$Eu(t,n);void 0!==e&&this._$Eh.set(e,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const n=new Set(e.flat(1/0).reverse());for(const e of n)t.unshift(l(e))}else void 0!==e&&t.push(l(e));return t}static _$Eu(e,t){const n=t.attribute;return!1===n?void 0:"string"==typeof n?n:"string"==typeof e?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=/* @__PURE__ */new Map,this._$E_(),this.requestUpdate(),null===(e=this.constructor.l)||void 0===e||e.forEach(e=>e(this))}addController(e){var t;(this._$EO??(this._$EO=/* @__PURE__ */new Set)).add(e),void 0!==this.renderRoot&&this.isConnected&&(null===(t=e.hostConnected)||void 0===t||t.call(e))}removeController(e){var t;null===(t=this._$EO)||void 0===t||t.delete(e)}_$E_(){const e=/* @__PURE__ */new Map,t=this.constructor.elementProperties;for(const n of t.keys())this.hasOwnProperty(n)&&(e.set(n,this[n]),delete this[n]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((e,t)=>{if(i)e.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(const i of t){const t=document.createElement("style"),o=n.litNonce;void 0!==o&&t.setAttribute("nonce",o),t.textContent=i.cssText,e.appendChild(t)}})(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),null===(e=this._$EO)||void 0===e||e.forEach(e=>{var t;return null===(t=e.hostConnected)||void 0===t?void 0:t.call(e)})}enableUpdating(e){}disconnectedCallback(){var e;null===(e=this._$EO)||void 0===e||e.forEach(e=>{var t;return null===(t=e.hostDisconnected)||void 0===t?void 0:t.call(e)})}attributeChangedCallback(e,t,n){this._$AK(e,n)}_$ET(e,t){const n=this.constructor.elementProperties.get(e),i=this.constructor._$Eu(e,n);if(void 0!==i&&!0===n.reflect){var o;const s=(void 0!==(null===(o=n.converter)||void 0===o?void 0:o.toAttribute)?n.converter:$).toAttribute(t,n.type);this._$Em=e,null==s?this.removeAttribute(i):this.setAttribute(i,s),this._$Em=null}}_$AK(e,t){const n=this.constructor,i=n._$Eh.get(e);if(void 0!==i&&this._$Em!==i){var o,s;const e=n.getPropertyOptions(i),r="function"==typeof e.converter?{fromAttribute:e.converter}:void 0!==(null===(o=e.converter)||void 0===o?void 0:o.fromAttribute)?e.converter:$;this._$Em=i;const a=r.fromAttribute(t,e.type);this[i]=a??(null===(s=this._$Ej)||void 0===s?void 0:s.get(i))??a,this._$Em=null}}requestUpdate(e,t,n,i=!1,o){if(void 0!==e){var s;const r=this.constructor;if(!1===i&&(o=this[e]),n??(n=r.getPropertyOptions(e)),!((n.hasChanged??b)(o,t)||n.useDefault&&n.reflect&&o===(null===(s=this._$Ej)||void 0===s?void 0:s.get(e))&&!this.hasAttribute(r._$Eu(e,n))))return;this.C(e,t,n)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(e,t,{useDefault:n,reflect:i,wrapped:o},s){n&&!(this._$Ej??(this._$Ej=/* @__PURE__ */new Map)).has(e)&&(this._$Ej.set(e,s??t??this[e]),!0!==o||void 0!==s)||(this._$AL.has(e)||(this.hasUpdated||n||(t=void 0),this._$AL.set(e,t)),!0===i&&this._$Em!==e&&(this._$Eq??(this._$Eq=/* @__PURE__ */new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}const e=this.scheduleUpdate();return null!=e&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[e,t]of this._$Ep)this[e]=t;this._$Ep=void 0}const e=this.constructor.elementProperties;if(e.size>0)for(const[t,n]of e){const{wrapped:e}=n,i=this[t];!0!==e||this._$AL.has(t)||void 0===i||this.C(t,void 0,n,i)}}let e=!1;const t=this._$AL;try{var n;e=this.shouldUpdate(t),e?(this.willUpdate(t),null===(n=this._$EO)||void 0===n||n.forEach(e=>{var t;return null===(t=e.hostUpdate)||void 0===t?void 0:t.call(e)}),this.update(t)):this._$EM()}catch(t){throw e=!1,this._$EM(),t}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;null===(t=this._$EO)||void 0===t||t.forEach(e=>{var t;return null===(t=e.hostUpdated)||void 0===t?void 0:t.call(e)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=/* @__PURE__ */new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(e=>this._$ET(e,this[e]))),this._$EM()}updated(e){}firstUpdated(e){}};x.elementStyles=[],x.shadowRootOptions={mode:"open"},x[y("elementProperties")]=/* @__PURE__ */new Map,x[y("finalized")]=/* @__PURE__ */new Map,null==m||m({ReactiveElement:x}),(v.reactiveElementVersions??(v.reactiveElementVersions=[])).push("2.1.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var k=globalThis,S=e=>e,z=k.trustedTypes,T=z?z.createPolicy("lit-html",{createHTML:e=>e}):void 0,R="$lit$",A=`lit$${Math.random().toFixed(9).slice(2)}$`,E="?"+A,M=`<${E}>`,C=document,I=()=>C.createComment(""),L=e=>null===e||"object"!=typeof e&&"function"!=typeof e,D=Array.isArray,P="[ \t\n\f\r]",O=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,F=/-->/g,N=/>/g,U=RegExp(`>|${P}(?:([^\\s"'>=/]+)(${P}*=${P}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),j=/'/g,B=/"/g,H=/^(?:script|style|textarea|title)$/i,W=e=>(t,...n)=>({_$litType$:e,strings:t,values:n}),Z=W(1),G=W(2),q=(W(3),Symbol.for("lit-noChange")),J=Symbol.for("lit-nothing"),V=/* @__PURE__ */new WeakMap,X=C.createTreeWalker(C,129);function K(e,t){if(!D(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==T?T.createHTML(t):t}var Y=(e,t)=>{const n=e.length-1,i=[];let o,s=2===t?"<svg>":3===t?"<math>":"",r=O;for(let a=0;a<n;a++){const t=e[a];let n,l,d=-1,c=0;for(;c<t.length&&(r.lastIndex=c,l=r.exec(t),null!==l);)c=r.lastIndex,r===O?"!--"===l[1]?r=F:void 0!==l[1]?r=N:void 0!==l[2]?(H.test(l[2])&&(o=RegExp("</"+l[2],"g")),r=U):void 0!==l[3]&&(r=U):r===U?">"===l[0]?(r=o??O,d=-1):void 0===l[1]?d=-2:(d=r.lastIndex-l[2].length,n=l[1],r=void 0===l[3]?U:'"'===l[3]?B:j):r===B||r===j?r=U:r===F||r===N?r=O:(r=U,o=void 0);const u=r===U&&e[a+1].startsWith("/>")?" ":"";s+=r===O?t+M:d>=0?(i.push(n),t.slice(0,d)+R+t.slice(d)+A+u):t+A+(-2===d?a:u)}return[K(e,s+(e[n]||"<?>")+(2===t?"</svg>":3===t?"</math>":"")),i]},Q=class e{constructor({strings:t,_$litType$:n},i){let o;this.parts=[];let s=0,r=0;const a=t.length-1,l=this.parts,[d,c]=Y(t,n);if(this.el=e.createElement(d,i),X.currentNode=this.el.content,2===n||3===n){const e=this.el.content.firstChild;e.replaceWith(...e.childNodes)}for(;null!==(o=X.nextNode())&&l.length<a;){if(1===o.nodeType){if(o.hasAttributes())for(const e of o.getAttributeNames())if(e.endsWith(R)){const t=c[r++],n=o.getAttribute(e).split(A),i=/([.?@])?(.*)/.exec(t);l.push({type:1,index:s,name:i[2],strings:n,ctor:"."===i[1]?oe:"?"===i[1]?se:"@"===i[1]?re:ie}),o.removeAttribute(e)}else e.startsWith(A)&&(l.push({type:6,index:s}),o.removeAttribute(e));if(H.test(o.tagName)){const e=o.textContent.split(A),t=e.length-1;if(t>0){o.textContent=z?z.emptyScript:"";for(let n=0;n<t;n++)o.append(e[n],I()),X.nextNode(),l.push({type:2,index:++s});o.append(e[t],I())}}}else if(8===o.nodeType)if(o.data===E)l.push({type:2,index:s});else{let e=-1;for(;-1!==(e=o.data.indexOf(A,e+1));)l.push({type:7,index:s}),e+=A.length-1}s++}}static createElement(e,t){const n=C.createElement("template");return n.innerHTML=e,n}};function ee(e,t,n=e,i){var o,s;if(t===q)return t;let r=void 0!==i?null===(o=n._$Co)||void 0===o?void 0:o[i]:n._$Cl;const a=L(t)?void 0:t._$litDirective$;return(null==r?void 0:r.constructor)!==a&&(null==r||null===(s=r._$AO)||void 0===s||s.call(r,!1),void 0===a?r=void 0:(r=new a(e),r._$AT(e,n,i)),void 0!==i?(n._$Co??(n._$Co=[]))[i]=r:n._$Cl=r),void 0!==r&&(t=ee(e,r._$AS(e,t.values),r,i)),t}var te=class{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:n}=this._$AD,i=((null==e?void 0:e.creationScope)??C).importNode(t,!0);X.currentNode=i;let o=X.nextNode(),s=0,r=0,a=n[0];for(;void 0!==a;){if(s===a.index){let t;2===a.type?t=new ne(o,o.nextSibling,this,e):1===a.type?t=new a.ctor(o,a.name,a.strings,this,e):6===a.type&&(t=new ae(o,this,e)),this._$AV.push(t),a=n[++r]}s!==(null==a?void 0:a.index)&&(o=X.nextNode(),s++)}return X.currentNode=C,i}p(e){let t=0;for(const n of this._$AV)void 0!==n&&(void 0!==n.strings?(n._$AI(e,n,t),t+=n.strings.length-2):n._$AI(e[t])),t++}},ne=class e{get _$AU(){var e;return(null===(e=this._$AM)||void 0===e?void 0:e._$AU)??this._$Cv}constructor(e,t,n,i){this.type=2,this._$AH=J,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=n,this.options=i,this._$Cv=(null==i?void 0:i.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return void 0!==t&&11===(null==e?void 0:e.nodeType)&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=ee(this,e,t),L(e)?e===J||null==e||""===e?(this._$AH!==J&&this._$AR(),this._$AH=J):e!==this._$AH&&e!==q&&this._(e):void 0!==e._$litType$?this.$(e):void 0!==e.nodeType?this.T(e):(e=>D(e)||"function"==typeof(null==e?void 0:e[Symbol.iterator]))(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==J&&L(this._$AH)?this._$AA.nextSibling.data=e:this.T(C.createTextNode(e)),this._$AH=e}$(e){var t;const{values:n,_$litType$:i}=e,o="number"==typeof i?this._$AC(e):(void 0===i.el&&(i.el=Q.createElement(K(i.h,i.h[0]),this.options)),i);if((null===(t=this._$AH)||void 0===t?void 0:t._$AD)===o)this._$AH.p(n);else{const e=new te(o,this),t=e.u(this.options);e.p(n),this.T(t),this._$AH=e}}_$AC(e){let t=V.get(e.strings);return void 0===t&&V.set(e.strings,t=new Q(e)),t}k(t){D(this._$AH)||(this._$AH=[],this._$AR());const n=this._$AH;let i,o=0;for(const s of t)o===n.length?n.push(i=new e(this.O(I()),this.O(I()),this,this.options)):i=n[o],i._$AI(s),o++;o<n.length&&(this._$AR(i&&i._$AB.nextSibling,o),n.length=o)}_$AR(e=this._$AA.nextSibling,t){var n;for(null===(n=this._$AP)||void 0===n||n.call(this,!1,!0,t);e!==this._$AB;){const t=S(e).nextSibling;S(e).remove(),e=t}}setConnected(e){var t;void 0===this._$AM&&(this._$Cv=e,null===(t=this._$AP)||void 0===t||t.call(this,e))}},ie=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,n,i,o){this.type=1,this._$AH=J,this._$AN=void 0,this.element=e,this.name=t,this._$AM=i,this.options=o,n.length>2||""!==n[0]||""!==n[1]?(this._$AH=Array(n.length-1).fill(/* @__PURE__ */new String),this.strings=n):this._$AH=J}_$AI(e,t=this,n,i){const o=this.strings;let s=!1;if(void 0===o)e=ee(this,e,t,0),s=!L(e)||e!==this._$AH&&e!==q,s&&(this._$AH=e);else{const i=e;let r,a;for(e=o[0],r=0;r<o.length-1;r++)a=ee(this,i[n+r],t,r),a===q&&(a=this._$AH[r]),s||(s=!L(a)||a!==this._$AH[r]),a===J?e=J:e!==J&&(e+=(a??"")+o[r+1]),this._$AH[r]=a}s&&!i&&this.j(e)}j(e){e===J?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}},oe=class extends ie{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===J?void 0:e}},se=class extends ie{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==J)}},re=class extends ie{constructor(e,t,n,i,o){super(e,t,n,i,o),this.type=5}_$AI(e,t=this){if((e=ee(this,e,t,0)??J)===q)return;const n=this._$AH,i=e===J&&n!==J||e.capture!==n.capture||e.once!==n.once||e.passive!==n.passive,o=e!==J&&(n===J||i);i&&this.element.removeEventListener(this.name,this,n),o&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;"function"==typeof this._$AH?this._$AH.call((null===(t=this.options)||void 0===t?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}},ae=class{constructor(e,t,n){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=n}get _$AU(){return this._$AM._$AU}_$AI(e){ee(this,e)}},le=k.litHtmlPolyfillSupport;null==le||le(Q,ne),(k.litHtmlVersions??(k.litHtmlVersions=[])).push("3.3.3");var de,ce=globalThis,ue=class extends x{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e;const t=super.createRenderRoot();return(e=this.renderOptions).renderBefore??(e.renderBefore=t.firstChild),t}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=((e,t,n)=>{const i=(null==n?void 0:n.renderBefore)??t;let o=i._$litPart$;if(void 0===o){const e=(null==n?void 0:n.renderBefore)??null;i._$litPart$=o=new ne(t.insertBefore(I(),e),e,void 0,n??{})}return o._$AI(e),o})(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),null===(e=this._$Do)||void 0===e||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),null===(e=this._$Do)||void 0===e||e.setConnected(!1)}render(){return q}};ue._$litElement$=!0,ue.finalized=!0,null===(de=ce.litElementHydrateSupport)||void 0===de||de.call(ce,{LitElement:ue});var he=ce.litElementPolyfillSupport;null==he||he({LitElement:ue}),(ce.litElementVersions??(ce.litElementVersions=[])).push("4.2.2");
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var _e={attribute:!0,type:String,converter:$,reflect:!1,hasChanged:b},pe=(e=_e,t,n)=>{const{kind:i,metadata:o}=n;let s=globalThis.litPropertyMetadata.get(o);if(void 0===s&&globalThis.litPropertyMetadata.set(o,s=/* @__PURE__ */new Map),"setter"===i&&((e=Object.create(e)).wrapped=!0),s.set(n.name,e),"accessor"===i){const{name:i}=n;return{set(n){const o=t.get.call(this);t.set.call(this,n),this.requestUpdate(i,o,e,!0,n)},init(t){return void 0!==t&&this.C(i,void 0,e,t),t}}}if("setter"===i){const{name:i}=n;return function(n){const o=this[i];t.call(this,n),this.requestUpdate(i,o,e,!0,n)}}throw Error("Unsupported decorator location: "+i)};function ve(e){return(t,n)=>"object"==typeof n?pe(e,t,n):((e,t,n)=>{const i=t.hasOwnProperty(n);return t.constructor.createProperty(n,e),i?Object.getOwnPropertyDescriptor(t,n):void 0})(e,t,n)}
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/function fe(e){return ve({...e,state:!0,attribute:!1})}var ge=[],me=/* @__PURE__ */new WeakMap;function ye(e,t){return function(e){let t=me.get(e);if(!t){t=/* @__PURE__ */new Map;for(const[n,i]of Object.entries(e)){const e=t.get(i.device_id);e?e.push([n,i]):t.set(i.device_id,[[n,i]])}me.set(e,t)}return t}(e).get(t)??ge}function $e(e){return`${e}: the configured detection-range limit, shown as a gate number.`}var be="💡 Each gate's **move / still threshold** is how strong a signal must be to count as presence at that distance. Lower = more sensitive (more false triggers), higher = less. Turn on **Radar Engineering Mode** and watch the Gate Energy chart while you move around to pick values. The sliders start locked, so a scroll cannot move them. Press **Unlock** above them to change one. Or press **Calibrate with empty room** on the Auto-calibrate card to set them from your empty room.";function we(e){return`**Radar Timeout** is how long ${e} stays on after the radar last detects someone; raise it if lights turn off while you sit still.`}function xe(e){return`Each gate is ${e} deep.`}var ke={move:[50,50,40,30,20,15,15,15,15],still:[0,0,40,40,30,30,20,20,20]},Se={key:"ld2410",label:"LD2410",maxBarLabels:["Max Move","Max Still"],rangeLabels:["Max Move Gate","Max Still Gate"],gateSizeLabel:"Gate Size",rangeTip:e=>`💡 **Max Move / Still Gate** cap the farthest gate used to detect moving vs. still targets; lower them to ignore distant motion. ${xe(e)} `+we("**Radar Target**"),gateTip:be,wikiUrl:"https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/",entityMap(e){const t=[0,1,2,3,4,5,6,7,8],n=e=>t.map(t=>e(t));return{engineering_mode:`switch.${e}_radar_engineering_mode`,bluetooth:`switch.${e}_ld2410_bluetooth`,restart_radar:`button.${e}_restart_radar`,factory_reset_radar:`button.${e}_factory_reset_radar`,esp_reboot:`button.${e}_esp_reboot`,query_params:`button.${e}_query_params`,radar_timeout:`number.${e}_radar_timeout`,zone_1_start:`number.${e}_radar_zone_1_start`,end_zone_1:`number.${e}_radar_end_zone_1`,end_zone_2:`number.${e}_radar_end_zone_2`,end_zone_3:`number.${e}_radar_end_zone_3`,max_move_distance:`number.${e}_radar_max_move_distance`,max_still_distance:`number.${e}_radar_max_still_distance`,gate_size:`select.${e}_ld2410_gate_size`,move_threshold:n(t=>`number.${e}_g${t}_move_threshold`),still_threshold:n(t=>`number.${e}_g${t}_still_threshold`),move_energy:n(t=>`sensor.${e}_g${t}_move_energy`),still_energy:n(t=>`sensor.${e}_g${t}_still_energy`),still_distance:`sensor.${e}_radar_still_distance`,moving_distance:`sensor.${e}_radar_moving_distance`,detection_distance:`sensor.${e}_radar_detection_distance`,radar_target:`binary_sensor.${e}_radar_target`,moving_target:`binary_sensor.${e}_radar_moving_target`,still_target:`binary_sensor.${e}_radar_still_target`,zone_1_occupancy:`binary_sensor.${e}_radar_zone_1_occupancy`,zone_2_occupancy:`binary_sensor.${e}_radar_zone_2_occupancy`,zone_3_occupancy:`binary_sensor.${e}_radar_zone_3_occupancy`,zone_occupancy:`binary_sensor.${e}_radar_zone_occupancy`}}},ze={key:"ld2412",label:"LD2412",maxBarLabels:["Max Gate","Min Gate"],maxBarTips:[$e("Max Gate"),"Min Gate: gates below this one are ignored for detection."],rangeLabels:["Max Gate","Min Gate"],gateSizeLabel:"Distance Resolution",rangeTip:e=>`💡 **Max Gate** is the farthest gate the radar uses and **Min Gate** the nearest; raise Min Gate to ignore anything right next to the sensor. ${xe(e)} `+we("**LD2412 Presence** (Radar Target)"),gateTip:be,wikiUrl:"https://wiki.apolloautomation.com/products/rpro1/setup/apollo-mmwave-dashboard/#r-pro-1-and-its-ld2412-radar",entityMap(e){const t=Array.from({length:14},(e,t)=>t),n=e=>t.map(t=>e((e=>String(e).padStart(2,"0"))(t)));return{engineering_mode:`switch.${e}_ld2412_engineering_mode`,bluetooth:`switch.${e}_ld2412_bluetooth`,restart_radar:`button.${e}_ld2412_restart`,factory_reset_radar:`button.${e}_ld2412_factory_reset`,esp_reboot:`button.${e}_esp_reboot`,radar_timeout:`number.${e}_ld2412_timeout`,zone_1_start:void 0,end_zone_1:void 0,end_zone_2:void 0,end_zone_3:void 0,zone_1_occupancy:void 0,zone_2_occupancy:void 0,zone_3_occupancy:void 0,zone_occupancy:void 0,max_move_distance:`number.${e}_ld2412_max_distance_gate`,max_still_distance:`number.${e}_ld2412_min_distance_gate`,gate_size:`select.${e}_ld2412_distance_resolution`,move_threshold:n(t=>`number.${e}_ld2412_g${t}_move_threshold`),still_threshold:n(t=>`number.${e}_ld2412_g${t}_still_threshold`),move_energy:n(t=>`sensor.${e}_ld2412_g${t}_move_energy`),still_energy:n(t=>`sensor.${e}_ld2412_g${t}_still_energy`),still_distance:void 0,moving_distance:void 0,detection_distance:void 0,radar_target:`binary_sensor.${e}_ld2412_presence`,moving_target:`binary_sensor.${e}_ld2412_moving_target`,still_target:`binary_sensor.${e}_ld2412_still_target`,background_correction:`button.${e}_ld2412_start_dynamic_background_correction`,background_correction_status:`binary_sensor.${e}_ld2412_dynamic_background_correction_status`,query_params:`button.${e}_ld2412_query_params`}}},Te=[ze,Se],Re=[{prefix:"msr-1",profile:Se,ld2450:!1,ld2460:!1},{prefix:"msr-2",profile:Se,ld2450:!1,ld2460:!1},{prefix:"mtr-1",ld2450:!0,ld2460:!1},{prefix:"r-pro-1",profile:ze,ld2450:!0,ld2460:!1}];function Ae(e){if(!(null==e?void 0:e.manufacturer)||!e.model)return;if("apolloautomation"!==e.manufacturer.toLowerCase())return;const t=e.model.toLowerCase(),n=Re.find(e=>t.startsWith(e.prefix));return n?{profile:n.profile,ld2450:n.ld2450,ld2460:n.ld2460}:void 0}function Ee(e,t){for(const n of Te){const i=n.entityMap(t).engineering_mode;if(i&&i in e.states)return n}}var Me=[/_ld2412_(?!.*ld2412_).+$/,/_ld2450_(?!.*ld2450_).+$/,/_target_\d+_[xy](?:_\d+)?$/,/_radar_engineering_mode(?:_\d+)?$/,/_ld2410_bluetooth(?:_\d+)?$/,/_radar_control_bluetooth(?:_\d+)?$/,/_radar_distance_resolution(?:_\d+)?$/,/_restart_radar(?:_\d+)?$/,/_factory_reset_radar(?:_\d+)?$/,/_esp_reboot(?:_\d+)?$/,/_radar_timeout(?:_\d+)?$/,/_radar_zone_\d+_start(?:_\d+)?$/,/_radar_end_zone_\d+(?:_\d+)?$/,/_radar_max_move_distance(?:_\d+)?$/,/_radar_max_still_distance(?:_\d+)?$/,/_ld2410_gate_size(?:_\d+)?$/,/_g\d+_move_threshold(?:_\d+)?$/,/_g\d+_still_threshold(?:_\d+)?$/,/_g\d+_move_energy(?:_\d+)?$/,/_g\d+_still_energy(?:_\d+)?$/,/_radar_still_distance(?:_\d+)?$/,/_radar_moving_distance(?:_\d+)?$/,/_radar_detection_distance(?:_\d+)?$/,/_radar_moving_target(?:_\d+)?$/,/_radar_still_target(?:_\d+)?$/,/_radar_target(?:_\d+)?$/,/_radar_zone_\d+_occupancy(?:_\d+)?$/];function Ce(e){for(const t of Me)if(t.test(e))return e.replace(t,"")}function Ie(e,t){const n=ye(e.entities,t).map(([e])=>e.slice(e.indexOf(".")+1)),i=/* @__PURE__ */new Map;for(const r of n){const e=Ce(r);e&&i.set(e,(i.get(e)??0)+1)}let o,s=0;for(const[r,a]of i)a>s&&(o=r,s=a);return o}var Le=["move_threshold","still_threshold","move_energy","still_energy"],De="(?:_\\d+)?$",Pe=(e,t,n)=>({slot:e,domain:t,re:new RegExp(n+De)}),Oe=[Pe("engineering_mode","switch","_radar_engineering_mode"),Pe("bluetooth","switch","_ld2410_bluetooth"),Pe("bluetooth","switch","_radar_control_bluetooth"),Pe("gate_size","select","_radar_distance_resolution"),Pe("restart_radar","button","_restart_radar"),Pe("factory_reset_radar","button","_factory_reset_radar"),Pe("esp_reboot","button","_esp_reboot"),Pe("query_params","button","_query_params"),Pe("radar_timeout","number","_radar_timeout"),Pe("zone_1_start","number","_radar_zone_1_start"),Pe("end_zone_1","number","_radar_end_zone_1"),Pe("end_zone_2","number","_radar_end_zone_2"),Pe("end_zone_3","number","_radar_end_zone_3"),Pe("max_move_distance","number","_radar_max_move_distance"),Pe("max_still_distance","number","_radar_max_still_distance"),Pe("gate_size","select","_ld2410_gate_size"),Pe("still_distance","sensor","_radar_still_distance"),Pe("moving_distance","sensor","_radar_moving_distance"),Pe("detection_distance","sensor","_radar_detection_distance"),Pe("moving_target","binary_sensor","_radar_moving_target"),Pe("still_target","binary_sensor","_radar_still_target"),Pe("radar_target","binary_sensor","_radar_target"),Pe("zone_1_occupancy","binary_sensor","_radar_zone_1_occupancy"),Pe("zone_2_occupancy","binary_sensor","_radar_zone_2_occupancy"),Pe("zone_3_occupancy","binary_sensor","_radar_zone_3_occupancy"),Pe("zone_occupancy","binary_sensor","_radar_zone_occupancy"),Pe("engineering_mode","switch","_ld2412_engineering_mode"),Pe("bluetooth","switch","_ld2412_bluetooth"),Pe("restart_radar","button","_ld2412_restart"),Pe("factory_reset_radar","button","_ld2412_factory_reset"),Pe("radar_timeout","number","_ld2412_timeout"),Pe("max_move_distance","number","_ld2412_max_distance_gate"),Pe("max_still_distance","number","_ld2412_min_distance_gate"),Pe("gate_size","select","_ld2412_distance_resolution"),Pe("radar_target","binary_sensor","_ld2412_presence"),Pe("moving_target","binary_sensor","_ld2412_moving_target"),Pe("still_target","binary_sensor","_ld2412_still_target"),Pe("background_correction","button","_ld2412_start_dynamic_background_correction"),Pe("background_correction_status","binary_sensor","_ld2412_dynamic_background_correction_status"),Pe("query_params","button","_ld2412_query_params")],Fe=[["move_threshold","number"],["still_threshold","number"],["move_energy","sensor"],["still_energy","sensor"]].map(([e,t])=>({slot:e,domain:t,re:new RegExp(`_g(\\d+)_${e}${De}`)}));function Ne(e,t){for(const n of Fe){const i=n.re.exec(t);if(i)return e===n.domain?{slot:n.slot,gate:parseInt(i[1],10)}:void 0}for(const n of Oe)if(n.re.test(t))return e===n.domain?{slot:n.slot}:void 0}var Ue=[/_ld2410_/,new RegExp(`_radar_engineering_mode${De}`),new RegExp(`_g\\d+_(?:move|still)_(?:threshold|energy)${De}`),new RegExp(`_radar_max_(?:move|still)_distance${De}`)];function je(e,t){let n=!1;for(const[i]of ye(e.entities,t)){const e=i.slice(i.indexOf(".")+1);if(/_ld2412_/.test(e))return ze;n||(n=Ue.some(t=>t.test(e)))}return n?Se:void 0}function Be(e,t){const n={move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]};let i=!1;for(const[o]of ye(e.entities,t)){const e=o.indexOf("."),t=Ne(o.slice(0,e),o.slice(e+1));if(t)if("gate"in t){const e=n[t.slot];void 0===e[t.gate]&&(e[t.gate]=o,i=!0)}else void 0===n[t.slot]&&(n[t.slot]=o,i=!0)}return i?n:void 0}function He(e,t){let n;return t.device_id&&(n=Ie(e,t.device_id)),!n&&t.device_base_name&&(n=t.device_base_name),n}function We(e,t){if(t.device_id){const n=je(e,t.device_id);if(n)return n;const i=Ae(e.devices[t.device_id]);if(i)return i.profile}const n=He(e,t);if(n)return Ee(e,n)??Se}function Ze(e,t){let n,i;if(t.device_id&&(n=Be(e,t.device_id)),!n){i=He(e,t);const o=i?We(e,t)??Se:void 0;n=i&&o?o.entityMap(i):{move_threshold:[],still_threshold:[],move_energy:[],still_energy:[]}}const o=t.entities?function(e,t){const n={...e,...t};for(const i of Le)Array.isArray(n[i])||(n[i]=e[i]);return n}(n,t.entities):n;return i?{map:o,fallbackBase:i}:{map:o}}function Ge(e,t){return!!t&&t in e.states}var qe=[{slot:"apollo_firmware",domain:"sensor",re:new RegExp(`_apollo_firmware_version${De}`)},{slot:"ld2410_firmware",domain:"sensor",re:new RegExp(`_radar_firmware_version${De}`)},{slot:"ld2412_firmware",domain:"sensor",re:new RegExp(`_ld2412_firmware${De}`)},{slot:"ld2450_firmware",domain:"sensor",re:new RegExp(`_ld2450_firmware${De}`)},{slot:"update",domain:"update",re:new RegExp(`_firmware_update${De}`)},{slot:"rssi",domain:"sensor",re:new RegExp(`_rssi${De}`)},{slot:"esp_reboot",domain:"button",re:new RegExp(`_esp_reboot${De}`)},{slot:"combined_presence",domain:"binary_sensor",re:new RegExp(`_combined_presence${De}`)}];function Je(e,t){const n={};for(const[i,o]of ye(e.entities,t)){if("apollo_mmwave"===o.platform)continue;const e=i.indexOf("."),t=i.slice(0,e),s=i.slice(e+1);for(const o of qe)o.domain===t&&void 0===n[o.slot]&&o.re.test(s)&&(n[o.slot]=i)}return n}function Ve(e,t){if("string"==typeof t)e.push(t);else if(Array.isArray(t))for(const n of t)n&&e.push(n)}function Xe(e){const t=[];for(const n of Object.values(e))Ve(t,n);return t}function Ke(e,t){const n=[];for(const i of t)Ve(n,e[i]);return n}function Ye(e,t,n){return(null==e?void 0:e.resolved)===t?e:{resolved:t,ids:Ke(t.map,n)}}function Qe(e){return Xe(e).filter(t=>t!==e.esp_reboot)}function et(e,t,n){if(e&&e.config===n&&e.entities===t.entities&&e.devices===t.devices&&(void 0===e.fallbackBase||Ee(t,e.fallbackBase)===e.fallbackDetected))return e;const{map:i,fallbackBase:o}=Ze(t,n);return{config:n,entities:t.entities,devices:t.devices,map:i,profile:We(t,n),ids:Xe(i),radarIds:Qe(i),fallbackBase:o,fallbackDetected:void 0===o?void 0:Ee(t,o)}}function tt(e,t,n){return n.some(n=>e.states[n]!==t.states[n])}function nt(e,t,n,i,o){if(i!==n)return tt(e,t,i.ids);const{radarIds:s}=i;return it(e,s)!==it(t,s)||tt(e,t,o)}function it(e,t){return t.some(t=>t in e.states)}var ot=/* @__PURE__ */new Map,st=!1;function rt(e,t){try{window.customElements.get(e)||window.customElements.define(e,t)}catch{}}function at(){for(const[e,t]of ot)rt(e,t)}function lt(e,t){if(ot.set(e,t),rt(e,t),!st){st=!0;for(const e of["home-assistant","hc-main"])window.customElements.whenDefined(e).then(at,()=>{})}}function dt(e,t,n){const i=window.customCards=window.customCards||[];i.some(t=>t.type===e)||i.push({type:e,name:t,description:n,documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"})}var ct=["mm","cm","m","in","ft","yd"],ut={mm:.001,cm:.01,m:1,in:.0254,ft:.3048,yd:.9144};function ht(e){return!!e&&ct.includes(e)}function _t(e,t,n){return t===n?e:function(e,t){return e*ut[t]}(e,t)/ut[n]}function pt(e,t){if(!t)return;const n=e.states[t];if(!n)return;const i=parseFloat(n.state);return Number.isFinite(i)?i:void 0}function vt(e,t,n){var i;const o=t?null===(i=e.states[t])||void 0===i||null===(i=i.attributes)||void 0===i?void 0:i.unit_of_measurement:void 0;return ht(o)?o:n}function ft(e){if(!e)return;const t=e.replace(",",".").match(/[0-9]*\.?[0-9]+/);if(!t)return;const n=parseFloat(t[0]);return Number.isFinite(n)?n:void 0}function gt(e,t,n){return t<=0?0:function(e,t,n){return Math.max(t,Math.min(n,e))}(e/t*n,0,n)}function mt(e){return Math.max(e.move_threshold.length,e.still_threshold.length,e.move_energy.length,e.still_energy.length)}var yt="#2e7d32",$t="#6a1b9a",bt=["#d32f2f","#1565c0","#2e7d32"];function wt(e,t){return`hsl(${220-220*e/Math.max(1,t-1)}, 64%, 48%)`}var xt="var(--secondary-text-color, #9aa0a6)";function kt(e,t,n){const i=pt(e,t);if(void 0!==i)return _t(i,vt(e,t,n),n)}var St=["gate_size","detection_distance","moving_distance","still_distance","radar_target","moving_target","still_target","zone_1_start","end_zone_1","end_zone_2","end_zone_3","zone_1_occupancy","zone_2_occupancy","zone_3_occupancy","max_move_distance","max_still_distance"];var zt=64,Tt=22,Rt=15;function At(e,t,n,i=Se.maxBarLabels,o="LD2410",s){if(0===t.move_threshold.length)return J;const r=function(e,t,n){var i;const o=_t(ft(t.gate_size?null===(i=e.states[t.gate_size])||void 0===i?void 0:i.state:void 0)??.75,"m",n),s=mt(t),r=s>1?s-1:8,a=o*r,l=[],d=(t,i,o,s)=>{var r,a,d;if(!t||!(t in e.states))return;const c=!!i&&"off"===(null===(r=e.states[i])||void 0===r?void 0:r.state),u=c?void 0:kt(e,t,n),h=!!i&&"on"===(null===(a=e.states[i])||void 0===a?void 0:a.state)&&"unknown"===(null===(d=e.states[t])||void 0===d?void 0:d.state);l.push({label:o,value:u??0,color:s,noTarget:c,unreported:h})};d(t.detection_distance,t.radar_target,"Detection","#b71c1c"),d(t.moving_distance,t.moving_target,"Moving",$t),d(t.still_distance,t.still_target,"Still",yt);const c=[],u=[kt(e,t.zone_1_start,n),kt(e,t.end_zone_1,n),kt(e,t.end_zone_2,n),kt(e,t.end_zone_3,n)],h=[t.zone_1_occupancy,t.zone_2_occupancy,t.zone_3_occupancy];for(let f=0;f<3;f++){var _;const t=u[f],n=u[f+1];if(void 0===t||void 0===n)continue;const i=h[f];c.push({label:`Zone ${f+1}`,start:t,end:n,color:bt[f],occupied:!!i&&"on"===(null===(_=e.states[i])||void 0===_?void 0:_.state)})}const p=pt(e,t.max_still_distance),v=pt(e,t.max_move_distance);return{unit:n,gateSizeChart:o,gateCount:r,maxRange:a,bars:l,zones:c,maxStill:void 0===p?void 0:p*o,maxMove:void 0===v?void 0:v*o,maxStillGate:p,maxMoveGate:v}}(e,t,n),a=e=>zt+gt(e,r.maxRange,402),l=[];r.zones.length&&l.push({kind:"zones"});for(const p of r.bars)l.push({kind:"bar",bar:p});l.push({kind:"gates"}),void 0!==r.maxMove&&void 0!==r.maxMoveGate&&l.push({kind:"max",label:i[0],value:r.maxMove,gate:r.maxMoveGate,tip:null==s?void 0:s[0],color:$t}),void 0!==r.maxStill&&void 0!==r.maxStillGate&&l.push({kind:"max",label:i[1],value:r.maxStill,gate:r.maxStillGate,tip:null==s?void 0:s[1],color:yt});const d=6+30*l.length,c=d+52,u=e=>r.gateSizeChart>=10?e.toFixed(0):String(Number(e.toFixed(2))),h=[];for(let p=0;p<=r.gateCount;p++){const e=a(r.gateSizeChart*p),t=r.gateSizeChart*p;h.push(G`
      <line x1=${e} y1=${6} x2=${e} y2=${d}
        stroke="var(--divider-color, #555)" stroke-width="1" opacity="0.3"></line>
      <text x=${e} y=${d+13} font-size="11" text-anchor="end"
        transform="rotate(-45 ${e} ${d+13})" fill=${xt}>${u(t)} ${n}</text>`)}const _=l.map((e,t)=>{const i=6+30*t,o=G`<text x=${58} y=${i+Rt} font-size="12"
      text-anchor="end" fill=${xt}>${function(e){return"zones"===e.kind?"Zones":"gates"===e.kind?"Gates":"bar"===e.kind?e.bar.label:e.label}(e)}</text>`;let s;if("zones"===e.kind)s=r.zones.map((e,t)=>{const n=a(e.start),o=a(e.end),s=o-n,r=s>=40;return G`
          <rect x=${n} y=${i} width=${Math.max(1,s)} height=${Tt}
            rx="4" fill=${e.color} opacity=${e.occupied?.95:.6}></rect>
          ${r?G`<text x=${n+6} y=${i+Rt} font-size="13" font-weight="600"
                fill="#fff">Z${t+1}</text>`:J}
          <circle cx=${o-11} cy=${i+11} r="5"
            fill=${e.occupied?"#fff":"none"} stroke="#fff" stroke-width="2"></circle>`});else if("bar"===e.kind){const t=a(e.bar.value),o=e.bar.noTarget?"no target":e.bar.unreported?"distance unknown":(e=>`${e.toFixed(1)} ${n}`)(e.bar.value);s=G`
        <rect x=${zt} y=${i} width=${Math.max(1,t-zt)} height=${Tt}
          rx="4" fill=${e.bar.color}></rect>
        ${function(e,t,n){return e>296.36?G`<text x=${e-6} y=${n+Rt} font-size="13" text-anchor="end" fill="#fff">${t}</text>`:G`<text x=${e+6} y=${n+Rt} font-size="13" fill=${"var(--primary-text-color, #e6e6e6)"}>${t}</text>`}(t,o,i)}`}else if("gates"===e.kind){const e=[];for(let t=0;t<r.gateCount;t++){const n=a(r.gateSizeChart*t),o=a(r.gateSizeChart*(t+1));e.push(G`
          <rect x=${n} y=${i} width=${Math.max(1,o-n)} height=${Tt}
            fill=${wt(t,r.gateCount)}></rect>
          <text x=${(n+o)/2} y=${i+Rt} font-size="12" font-weight="600"
            text-anchor="middle" fill="#fff">G${t+1}</text>`)}s=e}else{const t=a(e.value),n=`G${e.gate}`;s=G`
        <rect x=${zt} y=${i} width=${Math.max(1,t-zt)} height=${Tt}
          rx="4" fill=${e.color} opacity="0.6"></rect>
        <text x=${(zt+t)/2} y=${i+Rt} font-size="13" font-weight="600"
          text-anchor="middle" fill="#fff">${n}</text>`}const l="bar"===e.kind&&e.bar.noTarget?G`<g opacity=${.45}>${o}${s}</g>`:G`${o}${s}`;return G`<g>
      <title>${function(e){if("zones"===e.kind)return"Detection zones. The circle shows whether a target is currently in each zone (filled = present).";if("gates"===e.kind)return"The radar splits its range into gates. Each colored segment is one distance bin (G1, G2, ...).";if("max"===e.kind)return e.tip??$e(e.label);const t="Detection"===(n=e.bar.label)?"Current distance to the detected target.":"Moving"===n?"Current distance to a moving target.":"Current distance to a still (stationary) target.";var n;return e.bar.noTarget?`${t} The radar reports no target right now.`:e.bar.unreported?`${t} The radar reports a target, but its distance reads unknown.`:t}(e)}</title>
      <rect x="0" y=${i} width=${478} height=${Tt} fill="transparent"></rect>
      ${l}
    </g>`});return Z`
    <svg viewBox="0 0 ${478} ${c}" width="100%" role="img"
      aria-label="${o} distances">
      ${h} ${_}
    </svg>
  `}function Et(e,t,n,i){var o,s=arguments.length,r=s<3?t:null===i?i=Object.getOwnPropertyDescriptor(t,n):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,n,i);else for(var a=e.length-1;a>=0;a--)(o=e[a])&&(r=(s<3?o(r):s>3?o(t,n,r):o(t,n))||r);return s>3&&r&&Object.defineProperty(t,n,r),r}var Mt=class extends ue{setConfig(e){this._config=e}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-distance-card"}}shouldUpdate(e){if(!e.has("hass")||e.has("_config"))return!0;const t=e.get("hass");if(!t||!this.hass||!this._config)return!0;if(t.entities!==this.hass.entities||t.devices!==this.hass.devices||t.config!==this.hass.config)return!0;const n=this._resolved;return this._resolved=et(n,this.hass,this._config),this._watched=Ye(this._watched,this._resolved,St),nt(t,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return J;this._resolved=et(this._resolved,this.hass,this._config);const{map:e,profile:t,radarIds:n}=this._resolved;if(!it(this.hass,n))return this._renderNotFound();const i=ht(this._config.distance_unit)?this._config.distance_unit:"mi"===(null==(o=this.hass)||null===(s=o.config)||void 0===s||null===(s=s.unit_system)||void 0===s?void 0:s.length)?"in":"m";var o,s;const r=(null==t?void 0:t.label)??"LD2410",a=At(this.hass,e,i,null==t?void 0:t.maxBarLabels,r,null==t?void 0:t.maxBarTips);return a===J?J:Z`
      <ha-card .header=${this._config.title??`${r} Distances`}>
        <div class="wrap">${a}</div>
      </ha-card>
    `}_renderNotFound(){var e,t;const n=(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.label)??"LD2410";return Z`
      <ha-card .header=${(null===(t=this._config)||void 0===t?void 0:t.title)??`${n} Distances`}>
        <div class="not-found">
          Apollo mmWave Dashboard: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};Mt.styles=a`
    .wrap {
      padding: 4px 12px 12px;
    }
    .not-found {
      padding: 12px 16px 16px;
      color: var(--error-color, #db4437);
      font-size: 0.9em;
    }
  `,Et([ve({attribute:!1})],Mt.prototype,"hass",void 0),Et([fe()],Mt.prototype,"_config",void 0),lt("apollo-radar-distance-card",Mt),dt("apollo-radar-distance-card","Apollo Radar Distance Chart","Distance / zone chart for Apollo MSR (LD2410) & R PRO (LD2412).");var Ct="apollo_mmwave",It=`${Ct}/calibration/subscribe`,Lt=[1e3,2e3,5e3,1e4,2e4],Dt="Apollo mmWave Dashboard is not loaded, so calibration is unavailable.",Pt="Home Assistant has no device with this id. The radar was probably removed and re-added; reload the dashboard, or set device_id in the card YAML.",Ot=/^Validation error:\s*/;async function Ft(e,t,n){return e.connection.subscribeMessage(n,{type:It,device_id:t})}async function Nt(e,t){try{return await e.connection.subscribeMessage(e=>{(Array.isArray(e)?e:[e]).some(e=>{var t,n;return("updated"===(null==e?void 0:e.type)||"added"===(null==e?void 0:e.type))&&"apollo_mmwave"===(null==e||null===(t=e.entry)||void 0===t?void 0:t.domain)&&"loaded"===(null==e||null===(n=e.entry)||void 0===n?void 0:n.state)})&&t()},{type:"config_entries/subscribe"})}catch{return null}}function Ut(e,t,n,i,o=!1){return e.callService(t,n,i,void 0,o)}function jt(e){const t={};for(const[n,i]of Object.entries(e))void 0!==i&&(t[n]=i);return t}function Bt(e){if(e&&"object"==typeof e&&void 0===e.code){const t=e.error;if(t&&"object"==typeof t)return t}return e}function Ht(e){const t=Bt(e);if("apollo_mmwave"===(null==t?void 0:t.translation_domain))return"string"==typeof t.translation_key?t.translation_key:void 0}function Wt(e){const t=e.trim();return/[.!?]$/.test(t)?t:`${t}.`}function Zt(e,t={}){const n=Bt(e),i=null==n?void 0:n.code;if("not_found"===i){var o;if("service"!==t.source)return Pt;const e=null==n||null===(o=n.translation_placeholders)||void 0===o?void 0:o.domain;if(void 0===e||"apollo_mmwave"===e)return Dt}if("not_loaded"===i)return Dt;const s=function(e,t){const n=null==e?void 0:e.translation_domain,i=null==e?void 0:e.translation_key;if(!t||!n||!i)return null;let o;try{o=t(`component.${n}.exceptions.${i}.message`,e.translation_placeholders??void 0)}catch{return null}return!o||o.startsWith("Translation error")?null:Wt(o)}(n,t.localize);if(s)return s;const r="string"==typeof n?n:null==n?void 0:n.message;if(r){const e=String(r).replace(Ot,"");if(e.trim())return Wt(e)}return"Home Assistant rejected the request."}async function Gt(e,t){var n;const i=null===(n=Bt(t))||void 0===n?void 0:n.translation_domain;if(i&&"function"==typeof e.loadBackendTranslation)try{const t=await e.loadBackendTranslation("exceptions",i);if("function"==typeof t)return t}catch{}return"function"==typeof e.localize?e.localize.bind(e):void 0}async function qt(e,t){return Zt(t,{source:"service",localize:await Gt(e,t)})}var Jt=.5,Vt=["move","still"],Xt="If Radar Target turns off while someone sits still, raise Radar Timeout to 60 s or more on the Detection Range card. Undo restores the thresholds from before a calibration.",Kt="Read settings from the radar",Yt="Reading settings from the radar...",Qt=/* @__PURE__ */new Set(["done","cancelled","failed"]);function en(e){return void 0!==e&&Qt.has(e)}function tn(e){if(!e)return null;const t=new Date(e);return Number.isNaN(t.getTime())?null:t}function nn(e,t){return e.toDateString()===t.toDateString()}var on={hour:"2-digit",minute:"2-digit"},sn={day:"numeric",month:"short"};function rn(e,t=/* @__PURE__ */new Date){const n=tn(e);if(!n)return e;const i=nn(n,t)?on:{...sn,...on};return new Intl.DateTimeFormat(void 0,i).format(n)}function an(e){const t=tn(e);return t?new Intl.DateTimeFormat(void 0,{...sn,...on}).format(t):e}function ln(e){if(e>=60&&e%60==0){const t=e/60;return`${t} ${1===t?"minute":"minutes"}`}return`${e} ${1===e?"second":"seconds"}`}function dn(e,t){return`${e} ${1===e?t:`${t}s`}`}function cn(e){return Object.keys(e).sort((e,t)=>Number(e)-Number(t))}function un(e){const t=[];for(const i of["move","still"]){var n;const o=(null===(n=e.peaks)||void 0===n?void 0:n[i])??{},s=cn(o);if(0===s.length)continue;const r=s.map(e=>`G${e} ${o[e]}`).join(" · ");t.push(`Highest so far, ${i}: ${r}`)}return t}var hn="Reading the radar's current thresholds...",_n="Checking that the radar accepted the new values...",pn="Restoring saved thresholds...",vn="Finishing...";function fn(e){if("restore"===e.kind)switch(e.status){case"applying":return"refresh"===e.sub_phase?{phase:hn,detail:""}:{phase:pn,detail:`${e.writes_done} of ${e.writes_total}`};case"verifying":return{phase:_n,detail:""};case"preparing":return{phase:pn,detail:""};default:return{phase:vn,detail:""}}switch(e.status){case"preparing":return"settle"===e.sub_phase?{phase:"Leave the room now.",detail:""}:"warmup"===e.sub_phase?{phase:"Waiting for gate energy from the radar...",detail:""}:{phase:"Turning on Radar Engineering Mode...",detail:""};case"sampling":return{phase:"Listening to the empty room...",detail:`${e.remaining_s??e.duration_s} s left`};case"applying":return"refresh"===e.sub_phase?{phase:hn,detail:""}:{phase:`Writing ${e.writes_total} thresholds to the radar...`,detail:`${e.writes_done} of ${e.writes_total}`};case"verifying":return{phase:_n,detail:""};default:return{phase:vn,detail:""}}}function gn(e){return Number.isFinite(e)?Math.max(0,Math.min(1,e)):0}function mn(e){return null==e?"":String(Math.round(10*e)/10)}function yn(e){return null===e.peak||void 0===e.peak?"":e.flags.includes("spike")?`${mn(e.peak)} (spike seen)`:mn(e.peak)}function $n(e,t){var n;const i=t?null==e||null===(n=e.states)||void 0===n||null===(n=n[t])||void 0===n||null===(n=n.attributes)||void 0===n?void 0:n.max:void 0,o="number"==typeof i?i:"string"==typeof i?parseFloat(i):NaN;return Number.isFinite(o)?o:100}var bn=()=>100;function wn(e,t){return!e.skipped&&!e.flags.includes("unused")&&(null!==e.old&&void 0!==e.old&&null!==e.new&&void 0!==e.new&&(Math.abs(e.old-t)<=Jt&&e.new<t-Jt))}function xn(e,t,n){if("not selected"===e.skipped)return null===e.old?"(not selected)":`${mn(e.old)} (not selected)`;if(e.skipped)return`skipped: ${e.skipped}`;if(null===e.new||void 0===e.new)return"no data";if(e.written&&!1===e.confirmed&&null===e.actual)return"not confirmed (radar offline)";const i=e.flags.includes("off");if(!(null===e.old||Math.abs(e.new-e.old)>Jt))return i?`${mn(e.new)} (off)`:`${mn(e.old)} (unchanged)`;const o=`${mn(e.old)} → ${mn(e.new)}`,s=[];return i&&s.push("off"),wn(e,n)&&s.push("was off"),!t&&e.written&&!1===e.confirmed&&s.push("not confirmed"),s.length?`${o} (${s.join(", ")})`:o}function kn(e,t,n){return{peak:yn(e),text:xn(e,t,n(e.entity_id)),flags:[...e.flags]}}function Sn(e){const t=[e.move,e.still].filter(e=>"not selected"!==e.skipped);return t.length>0&&t.every(e=>e.flags.includes("unused"))}function zn(e){return e.map(e=>`G${e}`).join(", ")}function Tn(e,t){return`G${e} ${t} threshold`}function Rn(e){const t=e.unverified??[];if(0===t.length)return null;const n=t.map(t=>{const n=function(e,t){for(const n of e.gates??[]){if(n.move.entity_id===t)return Tn(n.gate,"move");if(n.still.entity_id===t)return Tn(n.gate,"still")}return t}(e,t.entity_id);return null===t.actual||void 0===t.actual?`${n} could not be read (radar offline)`:`${n} reads back ${mn(t.actual)} (asked for ${mn(t.asked)})`});return`${dn(t.length,"value")} could not be confirmed: ${n.join(", ")}. Check the Move / Still Thresholds cards.`}function An(e){const t=[],n=e.warnings??[];for(const i of n)if("presence"===i){const n=Math.round(100*(e.presence_fraction??0));t.push(`The radar reported someone present for ${n}% of the listen. If someone was in the room, even sitting still, press Undo and run it again.`)}else if("radar_unavailable"===i)t.push("The radar was unavailable for part of the listen; gates with too few readings were left as they were.");else if("unverified"===i){const n=Rn(e);n&&t.push(n)}else if("gate_off"===i)for(const n of e.gates_off??[])t.push(`The ${Tn(n.gate,n.channel)} is now off (its background peaked at ${mn(n.peak)}). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty.`);if(!n.includes("unverified")&&"restore"===e.kind){const n=Rn(e);n&&t.push(n)}return t}function En(e){return"move"===e?"Move Thresholds":"Still Thresholds"}function Mn(e,t=bn){const n="preview"===e.outcome;if("calibrate"!==e.kind)return[];if(!n&&"applied"!==e.outcome&&"partial"!==e.outcome)return[];const i=[];for(const o of e.gates??[])for(const e of Vt){const s=o[e],r=t(s.entity_id);if(!wn(s,r))continue;if(!(n||s.written&&!1!==s.confirmed))continue;const a=Tn(o.gate,e),l=mn(r),d=En(e);i.push(n?`The ${a} is off (set to ${l}) and calibration would turn it back on (would set ${mn(s.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card after you calibrate.`:`The ${a} was off (set to ${l}) and calibration turned it back on (now ${mn(s.new)}). If you turned it off on purpose, set it back to ${l} on the ${d} card, or press Undo to put back all your previous values.`)}return i}function Cn(e,t){var n;if(!t)return null;const i=parseFloat((null===(n=e.states[t])||void 0===n?void 0:n.state)??"");return Number.isFinite(i)?Math.trunc(i):null}function In(e,t,n,i){return"ld2412"===n?{max_move_gate:null,max_still_gate:null,min_gate:Cn(e,t.max_still_distance)??(null==i?void 0:i.min_gate)??null,max_gate:Cn(e,t.max_move_distance)??(null==i?void 0:i.max_gate)??null}:{max_move_gate:Cn(e,t.max_move_distance)??(null==i?void 0:i.max_move_gate)??null,max_still_gate:Cn(e,t.max_still_distance)??(null==i?void 0:i.max_still_gate)??null,min_gate:null,max_gate:null}}function Ln(e,t,n,i){if("ld2412"===e)return!(null!==t.min_gate&&n<t.min_gate)&&(null===t.max_gate||n<=t.max_gate);const o="move"===i?t.max_move_gate:t.max_still_gate;return null===o||n<=o}function Dn(e,t,n,i){var o;if(!e||"calibrate"!==e.kind)return!1;if("applied"!==e.outcome&&"partial"!==e.outcome)return!1;if((e.gates_off??[]).some(e=>e.gate===t&&e.channel===n))return!0;const s=null===(o=e.gates)||void 0===o||null===(o=o.find(e=>e.gate===t))||void 0===o?void 0:o[n];return!(!(null==s?void 0:s.written)||null===s.new||void 0===s.new)&&Math.abs(s.new-i)<=Jt}function Pn(e,t){let n=0;for(let i=t;i<e.length;i++){if("calibrate"===e[i].reason)return n%2==0?"previous":"calibrated";n+=1}return null}function On(e,t=/* @__PURE__ */new Date){const n=e[0];if(!n)return"Nothing to restore yet";switch(Pn(e,0)){case"previous":return"Undo (restore your previous values)";case"calibrated":return"Redo (put the calibrated values back)";default:return`Restore the values saved at ${rn(n.taken_at,t)}`}}function Fn(e,t=/* @__PURE__ */new Date){const n=e[0];if(!n)return;const i=tn(n.taken_at),o=rn(n.taken_at,t);return i&&nn(i,t)?`Saved at ${o}`:`Saved ${o}`}function Nn(e,t="changed"){const n=e.changed??0;return`${n} of ${n+(e.unchanged??0)} thresholds ${t}`}function Un(e){const t=e.writes_done??0;return 0===t?"Stopped. Nothing was changed.":`Stopped after ${t} of ${e.writes_total??t} values were written. Undo restores the saved values.`}function jn(e,t=/* @__PURE__ */new Date){if("failed"===e.status||"failed"===e.outcome)return Wn(e);if("cancelled"===e.outcome)return Un(e);const n=rn(e.finished_at,t);if("restore"===e.kind){const t=e.restored??0,i=e.unchanged??0;return`Restored ${dn(t,"value")} at ${n}, ${i} unchanged.`}const i=dn(e.samples??0,"sample");return"preview"===e.outcome?`Previewed at ${n} from ${i}. ${Nn(e,"would change")}.`:`Calibrated at ${n} from ${i}. ${Nn(e)}.`}function Bn(e){const t=e.writes_done??0;return 0===t?". Nothing was changed.":` after ${t} of ${e.writes_total??t} values were written.`}var Hn=/nothing was changed/i;function Wn(e){var t;const n=(null===(t=e.error)||void 0===t?void 0:t.message)??"Unknown error.",i="restore"===e.kind?"Restore failed: ":"Calibration failed: ";return 0!==(e.writes_done??0)||Hn.test(n)?`${i}${n}`:`${i}${n} Nothing was changed.`}function Zn(e,t){const n=e.restored_from;if((null==n?void 0:n.id)||(null==n?void 0:n.taken_at))return n;if(e.snapshot_id){const n=t.findIndex(t=>t.id===e.snapshot_id),i=n>=0?t[n+1]:void 0;return i?{id:i.id,taken_at:i.taken_at}:null}const i=t[0];return i?{id:i.id,taken_at:i.taken_at}:null}function Gn(e,t,n=/* @__PURE__ */new Date){const i=Zn(e,t),o=(null==i?void 0:i.id)?function(e,t,n){const i=t.findIndex(e=>e.id===n);if(i<0)return null;let o=0;if(e.snapshot_id){const n=t.findIndex(t=>t.id===e.snapshot_id);if(n<0)return null;o=n+1}return i===o?Pn(t,i):null}(e,t,i.id):null;if("previous"===o)return"Restored your previous values.";if("calibrated"===o)return"Restored the calibrated values.";const s=null==i?void 0:i.taken_at;return s?`Restored the thresholds from ${rn(s,n)}.`:"Restored the saved thresholds."}function qn(e){const t=e.missing??[];return t.length?`Not found any more: ${t.join(", ")}.`:null}var Jn={observedFinish:null,lastJobId:null,lastJobTerminal:!1};var Vn="#4b0082",Xn="#9467bd",Kn="#274e13",Yn="#8cb640",Qn="var(--secondary-text-color, #9aa0a6)",ei=a`
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
`,ti="The radar reports no target.",ni=["engineering_mode","move_threshold","still_threshold","move_energy","still_energy","max_move_distance","max_still_distance","moving_target","still_target"];function ii(e,t,n){var i,o;let s=!1;const r=In(e,t,n,null),a=t=>{t&&t in e.states&&(s=!0)},l=mt(t),d=Array.from({length:l},(i,o)=>(a(t.move_energy[o]),a(t.still_energy[o]),a(t.move_threshold[o]),a(t.still_threshold[o]),{index:o,move:pt(e,t.move_energy[o])??0,still:pt(e,t.still_energy[o])??0,moveThr:pt(e,t.move_threshold[o]),stillThr:pt(e,t.still_threshold[o]),moveInUse:Ln(n,r,o,"move"),stillInUse:Ln(n,r,o,"still")})),c=function(e,t){const n=t=>{var n;return t?null===(n=e.states[t])||void 0===n?void 0:n.state:void 0},i=n(t.moving_target),o=n(t.still_target);if(["on","off"].includes(i??"")&&["on","off"].includes(o??""))return"on"===i&&"on"===o?"The radar reports a moving and a still target.":"on"===i?"The radar reports a moving target.":"on"===o?"The radar reports a still target.":ti}(e,t);return{engineeringMode:!!t.engineering_mode&&"on"===(null===(i=e.states[t.engineering_mode])||void 0===i?void 0:i.state),unavailable:!!t.engineering_mode&&"unavailable"===(null===(o=e.states[t.engineering_mode])||void 0===o?void 0:o.state),present:s,gates:d,verdict:c,noTarget:c===ti}}function oi(e){return 10+186*(1-Math.max(0,Math.min(100,e))/100)}var si=class extends ue{setConfig(e){this._config=e}getCardSize(){return 6}static getStubConfig(){return{type:"custom:apollo-radar-gate-energy-card"}}shouldUpdate(e){if(!e.has("hass")||e.has("_config"))return!0;const t=e.get("hass");if(!t||!this.hass||!this._config)return!0;if(t.entities!==this.hass.entities||t.devices!==this.hass.devices)return!0;const n=this._resolved;return this._resolved=et(n,this.hass,this._config),this._watched=Ye(this._watched,this._resolved,ni),nt(t,this.hass,n,this._resolved,this._watched.ids)}render(){if(!this.hass||!this._config)return J;this._resolved=et(this._resolved,this.hass,this._config);const{map:e,profile:t,radarIds:n}=this._resolved;if(!it(this.hass,n))return this._renderNotFound();const i=(null==t?void 0:t.label)??"LD2410",o=function(e,t,n="LD2410",i){var o;const s=ii(e,t,i);if(!s.present)return J;const r=444/s.gates.length,a=.32*r,l=oi(0);let d=!1;const c=s.gates.map(e=>{const t=26+r*e.index+r/2,n=t-a-2,i=t+2,o=[],c=s.engineeringMode&&e.moveInUse&&void 0!==e.moveThr&&e.move>e.moveThr,u=s.engineeringMode&&e.stillInUse&&void 0!==e.stillThr&&e.still>e.stillThr;(c||u)&&(d=!0);const h=e.moveInUse?J:.3,_=e.stillInUse?J:.3;if(o.push(G`
      <rect x=${n} y=${oi(e.move)} width=${a} height=${l-oi(e.move)}
        fill=${Vn} opacity="${h}"
        stroke="${c?Xn:J}"
        stroke-width="${c?"2":J}"></rect>
      <rect x=${i} y=${oi(e.still)} width=${a} height=${l-oi(e.still)}
        fill=${Kn} opacity="${_}"
        stroke="${u?Yn:J}"
        stroke-width="${u?"2":J}"></rect>
      <text x=${t} y=${213} font-size="13" text-anchor="middle"
        fill=${Qn}>G${e.index}</text>`),s.engineeringMode&&void 0!==e.moveThr){const t=oi(e.moveThr),i=n+a/2;o.push(G`<path d="M ${i-5} ${t-5} L ${i-5} ${t+5} L ${i+5} ${t} Z"
        fill=${Xn} opacity="${h}"></path>`)}if(s.engineeringMode&&void 0!==e.stillThr){const t=oi(e.stillThr),n=i+a/2;o.push(G`<path d="M ${n+5} ${t-5} L ${n+5} ${t+5} L ${n-5} ${t} Z"
        fill=${Yn} opacity="${_}"></path>`)}return o}),u=[0,25,50,75,100].map(e=>G`
      <line x1=${26} y1=${oi(e)} x2=${470} y2=${oi(e)}
        stroke="var(--divider-color, #888)" stroke-width="1" opacity="0.3"></line>
      <text x=${22} y=${oi(e)+3} font-size="11" text-anchor="end"
        fill=${Qn}>${e}</text>`),[h,_]=s.unavailable?["Radar unavailable","Waiting for the device to reconnect"]:["Turn on Radar Engineering Mode","to see gate energy values"],p=s.engineeringMode?J:G`
        <rect x=${26} y=${10} width=${444} height=${186}
          fill="var(--card-background-color, #000)" opacity="0.78"></rect>
        <text x=${248} y=${103} font-size="20"
          font-weight="600" text-anchor="middle" fill="var(--primary-text-color, #e6e6e6)">
          <tspan x=${248} dy="-4">${h}</tspan>
          <tspan x=${248} dy="28">${_}</tspan>
        </text>`,v=t.engineering_mode,f=v?null===(o=e.states[v])||void 0===o?void 0:o.state:void 0,g=!s.engineeringMode&&v&&e.callService&&void 0!==f&&"unavailable"!==f?Z`<button
        type="button"
        class="overlay"
        tabindex="0"
        style="position:absolute;left:${248/470*100}%;top:${72.18181818181819}%;transform:translate(-50%,-50%)"
        @click=${()=>Ut(e,"switch","turn_on",{entity_id:v},!0).catch(()=>{})}
      >
        Turn on Radar Engineering Mode
      </button>`:J,m=Z`
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
  `,y=s.gates.some(e=>!e.moveInUse||!e.stillInUse),$=s.engineeringMode&&s.verdict?s.verdict:void 0,b=!!$&&s.noTarget&&d&&"ld2412"!==i;return Z`
    <div class="chart-plot" style="position:relative">
      ${m} ${g}
    </div>
    <div class="chart-legend">
      <span><span style="color:${Vn}">■</span> Move energy</span>
      <span><span style="color:${Kn}">■</span> Still energy</span>
      <span><span style="color:${Xn}">▶</span> Move threshold</span>
      <span><span style="color:${Yn}">◀</span> Still threshold</span>
      <span>outlined bar = above threshold</span>
      ${y?Z`<span>faded = outside the radar's range (ignored)</span>`:J}
    </div>
    <div class="chart-answer">
      ${$?Z`<div class="chart-verdict">${$}</div>`:J}
      ${b?Z`<div class="chart-verdict note">${"Energy above a threshold does not always mean a target. Once the LD2410 loses someone who sits still, it often needs them to move before it detects them again."}</div>`:J}
    </div>
  `}(this.hass,e,i,null==t?void 0:t.key);return o===J?J:Z`
      <ha-card .header=${this._config.title??`${i} Gate Energy`}>
        <div class="wrap">${o}</div>
      </ha-card>
    `}_renderNotFound(){var e,t;const n=(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.label)??"LD2410";return Z`
      <ha-card .header=${(null===(t=this._config)||void 0===t?void 0:t.title)??`${n} Gate Energy`}>
        <div class="not-found">
          Apollo mmWave Dashboard: device not found. Check the card's device
          configuration.
        </div>
      </ha-card>
    `}};si.styles=[ei,a`
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
    `],Et([ve({attribute:!1})],si.prototype,"hass",void 0),Et([fe()],si.prototype,"_config",void 0),lt("apollo-radar-gate-energy-card",si),dt("apollo-radar-gate-energy-card","Apollo Radar Gate Energy Chart","Per-gate move/still energy chart for Apollo MSR (LD2410) & R PRO (LD2412).");var ri="apollo-radar-calibrate-card",ai="Calibrate with empty room";function li(e){const t=/^(.+?) (\([^()]*\))$/.exec(e);return t?Z`<span class="value">${t[1]}</span> <span class="note">${t[2]}</span>`:Z`<span class="value">${e}</span>`}function di(e){try{const t=e();t&&"function"==typeof t.catch&&t.catch(()=>{})}catch{}}var ci=class extends ue{constructor(...e){super(...e),this._local=Jn,this._loadState="loading",this._loadError="",this._showLastResult=!1,this._readingSettings=!1,this._unsubscribe=null,this._serial=0,this._pending=!1,this._retryTimer=null,this._retryIndex=0,this._onReady=()=>this._reopen(),this._onDisconnected=()=>this._cancelRetry(),this._entryFeed=null,this._entryFeedSerial=0,this._lastJobApply=null,this._readSettingsToken=0,this._maxOf=e=>$n(this.hass,e)}setConfig(e){this._config=e}getCardSize(){return 6}static getStubConfig(){return{type:`custom:${ri}`}}connectedCallback(){super.connectedCallback(),this._attachConnectionListeners(),this._open()}disconnectedCallback(){super.disconnectedCallback(),this._cancelReadSettings(),this._detachConnectionListeners(),this._closeEntryFeed(),this._close()}shouldUpdate(e){if(1!==e.size||!e.has("hass"))return!0;const t=e.get("hass");return!(t&&this.hass&&this._config)||(t.entities!==this.hass.entities||t.devices!==this.hass.devices||t.connection!==this.hass.connection||(this._resolved=et(this._resolved,this.hass,this._config),tt(t,this.hass,this._watchedIds())))}willUpdate(e){if(!this.hass||!this._config)return;if(!e.has("hass")&&!e.has("_config"))return;this._resolved=et(this._resolved,this.hass,this._config);const t=function(e,t,n){if(t.device_id)return t.device_id;for(const o of Xe(n)){var i;const t=null===(i=e.entities[o])||void 0===i?void 0:i.device_id;if(t)return t}}(this.hass,this._config,this._resolved.map);this._attachConnectionListeners(),t!==this._deviceId&&(this._deviceId=t,this._payload=void 0,this._local=Jn,this._failure=void 0,this._stopError=void 0,this._turnOffError=void 0,this._lastJobApply=null,this._showLastResult=!1,this._cancelReadSettings(),this._retryIndex=0,this._loadState="loading",this._close()),this._open()}_watchedIds(){var e,t;const n=null===(e=this._resolved)||void 0===e?void 0:e.map;if(!n)return[];const i=null===(t=this._payload)||void 0===t?void 0:t.entities;return[n.engineering_mode,...n.move_threshold,...n.still_threshold,n.max_move_distance,n.max_still_distance,n.radar_target,n.background_correction_status,null==i?void 0:i.engineering_mode,null==i?void 0:i.background_status].filter(e=>!!e)}_apiHass(){var e;const t=this.hass;if((null==t?void 0:t.callService)&&(null===(e=t.connection)||void 0===e?void 0:e.subscribeMessage))return t}_open(){if(this._openEntryFeed(),!this.isConnected||this._unsubscribe||this._pending||this._retryTimer)return;const e=this._apiHass(),t=this._deviceId;if(!e||!t)return;const n=++this._serial;this._pending=!0,Ft(e,t,e=>{n===this._serial&&this._applyPayload(e)}).then(e=>{n===this._serial?(this._pending=!1,this._unsubscribe=e,this._retryIndex=0,"idle"!==this._loadState&&(this._loadState=this._payload?"idle":"loading")):di(e)},e=>{n===this._serial&&(this._pending=!1,this._failOpen(e))})}_failOpen(e){const t=null==e?void 0:e.code;if("not_loaded"===t&&this._retryIndex<Lt.length){const e=Lt[this._retryIndex];return this._retryIndex+=1,this._loadState="retrying",void(this._retryTimer=setTimeout(()=>{this._retryTimer=null,this._open()},e))}this._loadState="not_loaded"===t?"not_loaded":"error",this._loadError=Zt(e)}_close(){this._serial+=1,this._pending=!1,this._cancelRetry();const e=this._unsubscribe;this._unsubscribe=null,e&&di(e)}_cancelRetry(){null!==this._retryTimer&&(clearTimeout(this._retryTimer),this._retryTimer=null)}_reopen(){this._retryIndex=0,this._close(),this._open()}_openEntryFeed(){const e=this._apiHass(),t=null==e?void 0:e.connection;if(!(this.isConnected&&e&&t&&this._deviceId))return;if(this._entryFeedConnection===t)return;this._closeEntryFeed(),this._entryFeedConnection=t;const n=++this._entryFeedSerial;Nt(e,()=>{n===this._entryFeedSerial&&this._reopen()}).then(e=>{n===this._entryFeedSerial?this._entryFeed=e:e&&di(e)})}_closeEntryFeed(){this._entryFeedSerial+=1,this._entryFeedConnection=void 0;const e=this._entryFeed;this._entryFeed=null,e&&di(e)}_retryNow(){this._retryIndex=0,this._loadState="loading",this._close(),this._open()}_attachConnectionListeners(){var e;const t=null===(e=this.hass)||void 0===e?void 0:e.connection;this.isConnected&&t&&t!==this._listenedConnection&&(this._detachConnectionListeners(),t.addEventListener&&(t.addEventListener("ready",this._onReady),t.addEventListener("disconnected",this._onDisconnected),this._listenedConnection=t))}_detachConnectionListeners(){const e=this._listenedConnection;this._listenedConnection=void 0,(null==e?void 0:e.removeEventListener)&&(e.removeEventListener("ready",this._onReady),e.removeEventListener("disconnected",this._onDisconnected))}_applyPayload(e){var t;const n=null===(t=this._payload)||void 0===t||null===(t=t.job)||void 0===t?void 0:t.job_id;this._local=function(e,t){var n;const i=t.job;if(i){const t=en(i.status);return{observedFinish:t?i.job_id:e.observedFinish,lastJobId:i.job_id,lastJobTerminal:t}}let o=e.observedFinish;return null===e.lastJobId||e.lastJobTerminal||(null===(n=t.last_result)||void 0===n?void 0:n.job_id)!==e.lastJobId||(o=e.lastJobId),{observedFinish:o,lastJobId:null,lastJobTerminal:!1}}(this._local,e),this._payload=e,this._loadState="idle";const i=e.job;i&&(this._lastJobApply={jobId:i.job_id,apply:i.apply}),i&&!en(i.status)&&(this._failure=void 0),i&&!en(i.status)&&i.job_id===n||(this._stopError=void 0)}_start(e){var t;const n=this._apiHass(),i=this._deviceId;if(!n||!i)return;this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,this._local={...this._local,observedFinish:null};const o={...(null===(t=this._config)||void 0===t?void 0:t.calibration)??{}};e||(o.apply=!1),function(e,t,n={}){return Ut(e,Ct,"calibrate_gates",{device_id:t,...jt(n)})}(n,i,o).catch(t=>this._showServiceFailure("Calibration failed: ",t,()=>this._start(e)))}async _showServiceFailure(e,t,n){const i=this._deviceId,o=await qt(this.hass??{},t);i===this._deviceId&&(this._failure={prefix:e,message:o,retry:n,code:Ht(t)})}_stop(){const e=this._apiHass(),t=this._deviceId;e&&t&&(this._stopError=void 0,function(e,t){return Ut(e,Ct,"cancel_calibration",{device_id:t})}(e,t).catch(async e=>{const n=await qt(this.hass??{},e);t===this._deviceId&&(this._stopError=`Could not stop the calibration: ${n}`)}))}_undo(e){const t=this._apiHass(),n=this._deviceId;t&&n&&(this._cancelReadSettings(),this._failure=void 0,this._showLastResult=!1,function(e,t,n){return Ut(e,Ct,"restore_gate_thresholds",{device_id:t,...n?{snapshot_id:n}:{}})}(t,n,e).catch(t=>this._showServiceFailure("Restore failed: ",t,()=>this._undo(e))))}_turnOff(){const e=this._apiHass(),t=this._engineeringSwitchId();if(!e||!t)return;const n=this._deviceId;this._turnOffError=void 0,function(e,t,n){return Ut(e,"switch",n?"turn_on":"turn_off",{entity_id:t})}(e,t,!1).catch(async e=>{const t=await qt(this.hass??{},e);n===this._deviceId&&(this._turnOffError=`Could not turn Radar Engineering Mode off: ${t}`)})}_readSettingsThenRetry(e,t){const n=this._apiHass(),i=this._deviceId;if(!n||!i||this._readingSettings)return;const o=++this._readSettingsToken,s=()=>o===this._readSettingsToken&&i===this._deviceId;this._readingSettings=!0,this._readSettingsError=void 0,function(e,t){return Ut(e,"button","press",{entity_id:t})}(n,e).then(()=>{setTimeout(()=>{var e;if(!s())return;this._readingSettings=!1;const n=null===(e=this._payload)||void 0===e?void 0:e.job;n&&!en(n.status)||t()},3e3)},async e=>{const t=await qt(this.hass??{},e);s()&&(this._readingSettings=!1,this._readSettingsError=`Could not ask the radar for its settings: ${t}`)})}_cancelReadSettings(){this._readSettingsToken+=1,this._readingSettings=!1,this._readSettingsError=void 0}_closeResult(){this._cancelReadSettings(),this._failure=void 0,this._local={...this._local,observedFinish:null}}_profileKey(){var e,t;return(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.key)??(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.profile)}_engineeringSwitchId(){var e,t;return(null===(e=this._resolved)||void 0===e?void 0:e.map.engineering_mode)??(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.engineering_mode)??void 0}_engineeringOn(){var e,t;const n=this._engineeringSwitchId(),i=n&&this.hass?null===(e=this.hass.states[n])||void 0===e?void 0:e.state:void 0;return void 0!==i?"on"===i:!!(null===(t=this._payload)||void 0===t||null===(t=t.entities)||void 0===t?void 0:t.engineering_mode_on)}_backgroundOn(){var e,t,n,i;const o=(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.background_status)??(null===(t=this._resolved)||void 0===t?void 0:t.map.background_correction_status),s=o&&this.hass?null===(n=this.hass.states[o])||void 0===n?void 0:n.state:void 0;return void 0!==s?"on"===s:!!(null===(i=this._payload)||void 0===i||null===(i=i.entities)||void 0===i?void 0:i.background_status_on)}_queryParamsButtonId(){var e,t,n;const i=(null===(e=this._payload)||void 0===e||null===(e=e.entities)||void 0===e?void 0:e.query_params_button)??(null===(t=this._resolved)||void 0===t?void 0:t.map.query_params);return i&&(null===(n=this.hass)||void 0===n?void 0:n.states[i])?i:void 0}_warningLines(e){return[...An(e),...Mn(e,this._maxOf)]}_online(){var e;if(!this.hass||!this._resolved)return!1;if(!it(this.hass,this._resolved.ids))return!1;const t=this._engineeringSwitchId(),n=t?null===(e=this.hass.states[t])||void 0===e?void 0:e.state:void 0;return void 0!==n&&"unavailable"!==n}render(){return this.hass&&this._config?(this._resolved=et(this._resolved,this.hass,this._config),Z`
      <ha-card .header=${this._config.title??"Auto-calibrate"}>
        <div class="wrap">${this._renderSubtitle()} ${this._renderBody()}</div>
      </ha-card>
    `):J}_renderSubtitle(){var e,t;const n=this._deviceId;if(!n||!this.hass)return J;const i=(null===(e=this._resolved)||void 0===e||null===(e=e.profile)||void 0===e?void 0:e.label)??(null===(t=this._profileKey())||void 0===t?void 0:t.toUpperCase()),o=this.hass.devices[n],s=(null==o?void 0:o.name_by_user)||(null==o?void 0:o.name);return i||s?Z`<div class="subtitle">${[i,s].filter(Boolean).join(" · ")}</div>`:J}_renderBody(){var e;if(!this._deviceId)return Z`<p class="hint">${"Add device_id to this card's configuration to enable auto-calibration."}</p>`;if("retrying"===this._loadState)return Z`<div class="status" aria-live="polite"><p>${"Apollo mmWave Dashboard is still loading..."}</p></div>`;if("not_loaded"===this._loadState||"error"===this._loadState){const e="not_loaded"===this._loadState?"Apollo mmWave Dashboard is not loaded, so calibration is unavailable.":this._loadError;return Z`
        <div class="section">
          <div class="status" aria-live="polite"><p class="error">${e}</p></div>
          <div class="buttons">
            <button type="button" class="secondary" @click=${this._retryNow}>Retry</button>
          </div>
        </div>
      `}const t=this._payload;if(!t)return Z`<div class="status" aria-live="polite"><p class="hint">Loading...</p></div>`;const n=t.job;return n&&!en(n.status)?this._renderRunning(n):this._failure?this._renderFailure(this._failure,t):n&&(null===(e=t.last_result)||void 0===e?void 0:e.job_id)!==n.job_id?this._renderFinishing():function(e,t){var n;return null!==e.observedFinish&&!(t.job&&!en(t.job.status))&&(null===(n=t.last_result)||void 0===n?void 0:n.job_id)===e.observedFinish}(this._local,t)&&t.last_result?this._renderResult(t.last_result,t):this._renderIdle(t)}_renderRunning(e){const t=function(e,t){const n=function(e){return"ld2412"===e?"Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes.":"Leave Radar Engineering Mode on until this finishes."}(t),{phase:i,detail:o}=fn(e),s=o?`${i} ${o}`:i;if("restore"===e.kind)return[s];switch(e.status){case"preparing":return"engineering"===e.sub_phase?[s]:"settle"===e.sub_phase?[s,`Listening starts in ${e.remaining_s??e.settle_s} s.`,n]:[s,n];case"sampling":return[s,`Keep the room empty. ${dn(e.samples,"sample")} so far.`,...un(e),n];case"applying":return"refresh"===e.sub_phase?[s]:[s,"Values already written stay until you undo."];default:return[s]}}(e,this._profileKey()),{phase:n,detail:i}=fn(e),o="calibrate"===e.kind&&("preparing"===e.status||"sampling"===e.status||"applying"===e.status);return Z`
      <div class="section">
        <div class="status">
          <p class="headline"><span class="phase" aria-live="polite">${n}</span>${i?` ${i}`:""}</p>
          ${t.slice(1).map(e=>Z`<p>${e}</p>`)}
        </div>
        ${this._renderBar(e)}
        ${o?Z`
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
            `:J}
        ${this._stopError?Z`<p class="error" role="alert">${this._stopError}</p>`:J}
      </div>
    `}_renderBar(e){const{fraction:t,label:n}=function(e){return"preparing"===e.status&&"settle"===e.sub_phase&&e.settle_s>0?{fraction:gn(e.elapsed_s/e.settle_s),label:`${e.remaining_s??e.settle_s} s`}:"sampling"===e.status&&e.duration_s>0?{fraction:gn(e.elapsed_s/e.duration_s),label:`${e.remaining_s??e.duration_s} s left`}:"applying"===e.status&&"refresh"!==e.sub_phase&&e.writes_total>0?{fraction:gn(e.writes_done/e.writes_total),label:`${e.writes_done} of ${e.writes_total}`}:{fraction:null,label:""}}(e),i=null===t?100:Math.round(100*t);return Z`
      <div
        class="bar ${null===t?"indeterminate":""}"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${null===t?J:i}
        aria-label=${n||J}
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
    `}_renderReadSettingsLines(e){if("thresholds_not_numeric"!==e)return J;const t=this._queryParamsButtonId()?"":"Open the radar's device page, press its Query Params button in the Diagnostic section, wait a few seconds, then try again.";return Z`<div class="read-settings">
      ${t?Z`<p>${t}</p>`:J}
      ${this._readingSettings?Z`<p>${Yt}</p>`:J}
      ${this._readSettingsError?Z`<p class="error" role="alert">${this._readSettingsError}</p>`:J}
    </div>`}_renderRetryButton(e,t){const n="thresholds_not_numeric"===e?this._queryParamsButtonId():void 0;return n?Z`<button
      type="button"
      class="primary"
      ?disabled=${this._readingSettings}
      @click=${()=>this._readSettingsThenRetry(n,t)}
    >
      ${Kt}
    </button>`:Z`<button type="button" class="primary" @click=${t}>Try again</button>`}_renderResult(e,t){const n=t.snapshots??[],i=this._renderBanner(t),o=n.length?Z`<button
          type="button"
          class="secondary"
          title=${Fn(n)??J}
          @click=${()=>this._undo()}
        >
          ${On(n)}
        </button>`:J,s=e=>Z`<button type="button" class="primary" @click=${()=>this._start(!0)}>${e}</button>`;var r;if("failed"===e.status||"failed"===e.outcome)return Z`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="error">${Wn(e)}</p>
            ${this._renderReadSettingsLines(null===(r=e.error)||void 0===r?void 0:r.code)}
          </div>
          <div class="buttons">
            ${function(e){return(e.writes_done??0)>0&&!!e.snapshot_id}(e)?o:J} ${this._renderTryAgain(e,n)}
            ${this._closeButton()}
          </div>
        </div>
      `;if("cancelled"===e.outcome){const t=e.writes_done??0;return Z`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite"><p>${Un(e)}</p></div>
          <div class="buttons">
            ${t>0?o:J} ${s(ai)} ${this._closeButton()}
          </div>
        </div>
      `}if("restore"===e.kind){const r=qn(e);return Z`
        <div class="section">
          ${i}
          <div class="status" aria-live="polite">
            <p class="headline">${Gn(e,n)}</p>
            ${r?Z`<p>${r}</p>`:J}
            ${this._warningLines(e).map(e=>Z`<p class="warning">${e}</p>`)}
          </div>
          ${this._renderIdleBody(t)}
          <div class="buttons">${o} ${s(ai)}</div>
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
          <div class="buttons">${s("Calibrate and apply")} ${this._closeButton()}</div>
        </div>
      `:Z`
      <div class="section">
        ${i}
        <div class="status" aria-live="polite">
          <p class="headline">${function(e){return"partial"===e.outcome?`Thresholds updated, ${(e.unverified??[]).length} could not be confirmed`:"Thresholds updated"}(e)}</p>
          <p>${jn(e)}</p>
        </div>
        ${this._renderTable(e)}
        ${this._warningLines(e).map(e=>Z`<p class="warning">${e}</p>`)}
        <p>${"Now walk around, then sit still for a minute: the Radar Target row in Target / Occupancy should stay on the whole time you are in the room and turn off a few seconds after you leave (Radar Timeout)."}</p>
        <p class="hint">${Xt}</p>
        <div class="buttons">${o} ${s("Calibrate again")} ${this._closeButton()}</div>
      </div>
    `}_renderTryAgain(e,t){var n;let i;if("restore"===e.kind){const n=Zn(e,t);if(!(null==n?void 0:n.id))return J;const o=n.id;i=()=>this._undo(o)}else{const t=this._lastJobApply,n=!t||t.jobId!==e.job_id||t.apply;i=()=>this._start(n)}return this._renderRetryButton(null===(n=e.error)||void 0===n?void 0:n.code,i)}_renderTable(e){const t=function(e,t=bn){const n="preview"===e.outcome;return(e.gates??[]).map(e=>({gate:e.gate,label:`G${e.gate}`,move:kn(e.move,n,t),still:kn(e.still,n,t),unused:Sn(e)}))}(e,this._maxOf),n=function(e){const t=e.gates??[],n=[];if("ld2412"===e.profile){const i=t.filter(e=>e.move.flags.includes("unused")||e.still.flags.includes("unused")),o=e.min_gate??null,s=e.max_gate??null,r=i.filter(e=>null!==o&&e.gate<o).map(e=>e.gate),a=i.filter(e=>null!==s&&e.gate>s).map(e=>e.gate);return r.length&&n.push(`${zn(r)}: not used (below Min Gate ${o})`),a.length&&n.push(`${zn(a)}: not used (beyond Max Gate ${s})`),n}const i=t.filter(e=>e.move.flags.includes("unused")).map(e=>e.gate),o=t.filter(e=>e.still.flags.includes("unused")).map(e=>e.gate);return i.length&&n.push(`${zn(i)}: not used (beyond Max Move Gate ${e.max_move_gate??"?"})`),o.length&&n.push(`${zn(o)}: not used (beyond Max Still Gate ${e.max_still_gate??"?"})`),n}(e),i=e=>e.includes("unused")?"unused":"";return Z`
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
        <td class="threshold ${i(e.move.flags)}">${li(e.move.text)}</td>
        <td class=${i(e.still.flags)}>${e.still.peak}</td>
        <td class="threshold ${i(e.still.flags)}">${li(e.still.text)}</td>
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
    `}_renderIdleBody(e){var t,n;const i=(null===(t=this._config)||void 0===t||null===(t=t.calibration)||void 0===t?void 0:t.settle_s)??15,o=(null===(n=this._config)||void 0===n||null===(n=n.calibration)||void 0===n?void 0:n.duration_s)??60,s="ld2412"===this._profileKey(),r=this._engineeringOn()?"Radar Engineering Mode is already on and will stay on.":"Home Assistant turns Radar Engineering Mode on for the listen and back off afterward.",a=!(!this.hass||!this._resolved)&&function(e,t,n,i=[]){if("ld2410"!==n||i.length>0)return!1;const o=ke,s=(t,n)=>{if(0===n.length)return!1;for(let o=0;o<n.length;o++){var i;const s=t[o];if(!s)return!1;const r=null===(i=e.states[s])||void 0===i?void 0:i.state;if(void 0===r)return!1;const a=parseFloat(r);if(!Number.isFinite(a)||a!==n[o])return!1}return!0};return s(t.move_threshold,o.move)&&s(t.still_threshold,o.still)}(this.hass,this._resolved.map,this._profileKey(),e.snapshots??[]),l=this._offGatesLine(e);return Z`
      <div class="idle-body">
        <p>${function(e,t){const n=`listens for ${ln(t)}, then sets every gate's move and still threshold a margin above the background it heard.`;return`Teach the radar what your empty room looks like. ${e>0?`It counts down ${ln(e)} so you can leave, ${n}`:`It ${n}`} Your current thresholds are saved first, so you can undo.`}(i,o)}</p>
        <ul>
        <li>Nobody in the radar's view: people, pets, robot vacuums.</li>
        <li>
          Fans, curtains and plants that normally move are part of the background. Leave them
          as they usually are.
        </li>
        <li>${r}</li>
        ${s?Z`<li>
              LD2412: run Start Dynamic Background Correction (Controls card) first with the
              room empty and wait for its status to turn off. Calibrate afterward.
            </li>`:J}
        ${s&&this._backgroundOn()?Z`<li>
              Background correction is running on the LD2412. Wait for its status to turn off.
            </li>`:J}
        </ul>
        ${l?Z`<p class="warning">${l}</p>`:J}
        ${a?Z`<p class="hint">${"These look like factory thresholds. Calibrating sets them for your room."}</p>`:J}
        <p class="hint">${Xt}</p>
      </div>
    `}_offGatesLine(e){if(!this.hass||!this._resolved)return null;const t=this._resolved.map,n=this._profileKey(),i=In(this.hass,t,n,e.entities);return function(e){if(0===e.length)return null;const t=e=>`G${e.gate} ${e.channel}`;if(1===e.length){const t=e[0];return`The ${Tn(t.gate,t.channel)} is off (set to ${mn(t.max)}). Calibrating will turn it back on.`}const n=e[0].max;return(e.every(e=>e.max===n)?`These thresholds are off (set to ${mn(n)}): ${e.map(t).join(", ")}.`:`These thresholds are off: ${e.map(e=>`${t(e)} (set to ${mn(e.max)})`).join(", ")}.`)+" Calibrating will turn them back on."}(function(e,t,n,i,o){const s=[],r=Math.max(t.move_threshold.length,t.still_threshold.length);for(let l=0;l<r;l++)for(const r of Vt){var a;if("ld2410"===n&&"still"===r&&l<=1)continue;if(!Ln(n,i,l,r))continue;const d=("move"===r?t.move_threshold:t.still_threshold)[l],c=("move"===r?t.move_energy:t.still_energy)[l];if(!d||!c||void 0===e.states[c])continue;const u=parseFloat((null===(a=e.states[d])||void 0===a?void 0:a.state)??"");if(!Number.isFinite(u))continue;const h=$n(e,d);Math.abs(u-h)>Jt||Dn(o,l,r,h)||s.push({gate:l,channel:r,max:h})}return s}(this.hass,t,n,i,e.last_result))}_renderIdleButtons(e,t){const n=function(e,t,n=(()=>{var t;return null==e||null===(t=e.entities)||void 0===t?void 0:t.background_status_on})()??!1){return!(!t||!(null==e?void 0:e.entities)||e.job||!e.entities.engineering_mode||n)}(e,t,this._backgroundOn())&&!!this._apiHass();return Z`
      <div class="actions">
        <div class="buttons">
          <button type="button" class="primary" ?disabled=${!n} @click=${()=>this._start(!0)}>
            ${ai}
          </button>
          <button type="button" class="text" ?disabled=${!n} @click=${()=>this._start(!1)}>
            Preview only
          </button>
        </div>
        <p class="helper">${"Computes new thresholds without changing any of them. Radar Engineering Mode is still turned on for the listen."}</p>
      </div>
    `}_renderFooter(e,t){const n=e.last_result;if(!t.length&&!n)return J;const i=function(e){const t=e[0];return t&&null!==Pn(e,0)?`Saved ${an(t.taken_at)}.`:null}(t);return Z`
      <div class="footer">
        ${t.length?Z`
              <div class="last">
                ${n?Z`<p>${function(e){const t=an(e.finished_at),n="restore"===e.kind?"restore":!1===e.apply?"preview":"calibration";switch(e.outcome){case"applied":case"partial":return`Last calibrated ${t}, ${Nn(e)}.`;case"restored":return`Last restored ${t}.`;case"preview":return`Last previewed ${t}.`;case"cancelled":return`Last ${n} ${t} was stopped${Bn(e)}`;default:var i;return"cancelled_by_shutdown"===(null===(i=e.error)||void 0===i?void 0:i.code)?`Last ${n} ${t} was stopped by a Home Assistant restart${Bn(e)}`:`Last ${n} ${t} failed${Bn(e)}`}}(n)}</p>`:J}
                <div class="buttons">
                  <button
                    type="button"
                    class="secondary"
                    title=${Fn(t)??J}
                    @click=${()=>this._undo()}
                  >
                    ${On(t)}
                  </button>
                </div>
                ${i?Z`<p class="helper">${i}</p>`:J}
              </div>
            `:J}
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
                ${this._showLastResult?this._renderStoredResult(n):J}
              </div>
            `:J}
      </div>
    `}_renderStoredResult(e){if("failed"===e.status||"failed"===e.outcome)return Z`<div class="stored"><p class="error">${Wn(e)}</p></div>`;const t=this._warningLines(e).map(e=>Z`<p class="warning">${e}</p>`);if("restore"===e.kind)return Z`<div class="stored">
        ${function(e){const t=[jn(e)],n=qn(e);return n&&t.push(n),t}(e).map(e=>Z`<p>${e}</p>`)} ${t}
      </div>`;const n=(e.gates??[]).length>0;return Z`<div class="stored">
      <p>${jn(e)}</p>
      ${n?this._renderTable(e):J} ${t}
    </div>`}_renderBanner(e){const t=e.interrupted;if(!t)return J;const n=this._engineeringOn()&&("engineering"===t.phase||t.left_on),i="applying"===t.phase;if(!n&&!i)return J;const o=t.left_on?"The last calibration could not turn Radar Engineering Mode back off (the radar was offline).":"restore"===t.kind?"A restore was interrupted by a restart.":"A calibration was interrupted by a restart.",s=e.snapshots??[],r=s.find(e=>e.id===t.snapshot_id)??s[0],a=r?rn(r.taken_at):"the start";return Z`
      <div class="banner" role="status">
        <p>${o}</p>
        ${n?Z`<p>
              Radar Engineering Mode may still be on.
              <button type="button" class="secondary" @click=${this._turnOff}>Turn it off</button>
            </p>`:J}
        ${n&&this._turnOffError?Z`<p class="error" role="alert">${this._turnOffError}</p>`:J}
        ${i?Z`<p>
              Some thresholds may have been written. Undo restores the values saved at
              ${a}.
              <button type="button" class="secondary" ?disabled=${!r} @click=${()=>this._undo()}>
                Undo
              </button>
            </p>`:J}
      </div>
    `}};ci.styles=a`
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
  `,Et([ve({attribute:!1})],ci.prototype,"hass",void 0),Et([fe()],ci.prototype,"_config",void 0),Et([fe()],ci.prototype,"_payload",void 0),Et([fe()],ci.prototype,"_local",void 0),Et([fe()],ci.prototype,"_loadState",void 0),Et([fe()],ci.prototype,"_loadError",void 0),Et([fe()],ci.prototype,"_failure",void 0),Et([fe()],ci.prototype,"_stopError",void 0),Et([fe()],ci.prototype,"_turnOffError",void 0),Et([fe()],ci.prototype,"_showLastResult",void 0),Et([fe()],ci.prototype,"_readingSettings",void 0),Et([fe()],ci.prototype,"_readSettingsError",void 0),lt(ri,ci);var ui=window.customCards=window.customCards||[];ui.some(e=>"apollo-radar-calibrate-card"===e.type)||ui.push({type:ri,name:"Apollo Radar Auto-Calibrate",description:"One-button empty-room calibration of every gate threshold on an Apollo MSR (LD2410) or R PRO (LD2412), with undo.",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"});Object.freeze(["wall","high","ceiling"]),Object.freeze({range_mm:6e3,half_fov_deg:60});var hi=/(?:^|_)ld2460_target_(\d+)_x(?:_\d+)?$/,_i=/(?:^|_)ld2460_target_(\d+)_y(?:_\d+)?$/,pi=/(?:^|_)ld2460_installation_mode(?:_\d+)?$/,vi=/(?:^|_)ld2460_(?:presence_)?target_count(?:_\d+)?$/;Object.freeze({yMax:6e3,fovDeg:120}),Object.freeze({yMax:4e3,fovDeg:360}),Object.freeze({minMm:2e3,defaultMm:2700,maxMm:4e3});var fi=e=>e.slice(e.indexOf(".")+1);function gi(e,t){for(const[n]of ye(e.entities,t))if(n.startsWith("sensor.")&&hi.test(fi(n)))return!0;return!1}var mi=/(?:_ld2450)?_target_(\d+)_x(?:_\d+)?$/,yi=/(?:_ld2450)?_target_(\d+)_y(?:_\d+)?$/,$i=e=>mi.test(e)&&!hi.test(e),bi=e=>yi.test(e)&&!_i.test(e);function wi(e,t){for(const[n]of ye(e.entities,t))if(n.startsWith("sensor.")&&$i(n.slice(n.indexOf(".")+1)))return!0;return!1}function xi(e,t){return{type:"custom:apollo-radar-zone-map-card",device_id:e,title:t,unit_display:!0}}function ki(e){try{const t=e();t&&"function"==typeof t.catch&&t.catch(()=>{})}catch{}}var Si=class{constructor(e){this._activity="unknown",this._unsubscribe=null,this._serial=0,this._pending=!1,this._retryTimer=null,this._retryIndex=0,this._refused=!1,this._onReady=()=>this._reopen(),this._onDisconnected=()=>this._cancelRetry(),this._entryFeed=null,this._entryFeedSerial=0,this._onChange=e}get activity(){return this._activity}watch(e,t){var n;const i=null==e?void 0:e.connection;(null==i?void 0:i.subscribeMessage)&&t?(t===this._deviceId&&i===(null===(n=this._api)||void 0===n?void 0:n.connection)||(this.close(),this._api={connection:i},this._deviceId=t),this._listen(i),this._openEntryFeed(i),this._open()):this.close()}close(){this._retryIndex=0,this._closeFeed(),this._unlisten(),this._closeEntryFeed(),this._api=void 0,this._deviceId=void 0,this._set("unknown")}_set(e){e!==this._activity&&(this._activity=e,this._onChange())}_open(){const e=this._api,t=this._deviceId;if(!e||!t||this._unsubscribe||this._pending||this._retryTimer)return;if(this._refused)return;const n=++this._serial;this._pending=!0,Ft(e,t,e=>{n===this._serial&&this._set(function(e){var t;const n=null==e?void 0:e.job;return n?en(n.status)&&(null==e||null===(t=e.last_result)||void 0===t?void 0:t.job_id)===n.job_id?"idle":"running":"idle"}(e))}).then(e=>{n===this._serial?(this._pending=!1,this._unsubscribe=e,this._retryIndex=0):ki(e)},e=>{if(n!==this._serial)return;if(this._pending=!1,this._set("idle"),"not_loaded"!==(null==e?void 0:e.code)||this._retryIndex>=Lt.length)return void(this._refused=!0);const t=Lt[this._retryIndex];this._retryIndex+=1,this._retryTimer=setTimeout(()=>{this._retryTimer=null,this._open()},t)})}_closeFeed(){this._serial+=1,this._pending=!1,this._refused=!1,this._cancelRetry();const e=this._unsubscribe;this._unsubscribe=null,e&&ki(e)}_reopen(){this._retryIndex=0,this._closeFeed(),this._open()}_cancelRetry(){null!==this._retryTimer&&(clearTimeout(this._retryTimer),this._retryTimer=null)}_listen(e){e!==this._listened&&(this._unlisten(),e.addEventListener&&(e.addEventListener("ready",this._onReady),e.addEventListener("disconnected",this._onDisconnected),this._listened=e))}_unlisten(){const e=this._listened;this._listened=void 0,(null==e?void 0:e.removeEventListener)&&(e.removeEventListener("ready",this._onReady),e.removeEventListener("disconnected",this._onDisconnected))}_openEntryFeed(e){const t=this._api;if(!t||this._entryFeedConnection===e)return;this._closeEntryFeed(),this._entryFeedConnection=e;const n=++this._entryFeedSerial;Nt(t,()=>{n===this._entryFeedSerial&&this._reopen()}).then(e=>{n===this._entryFeedSerial?this._entryFeed=e:e&&ki(e)})}_closeEntryFeed(){this._entryFeedSerial+=1,this._entryFeedConnection=void 0;const e=this._entryFeed;this._entryFeed=null,e&&ki(e)}};function zi(e,t){return`Apollo mmWave Dashboard was updated to ${e}, but this page still runs ${t}.`}function Ti(e,t){return`Apollo mmWave Dashboard ${t} is installed, but Home Assistant still runs ${e}. Restart Home Assistant to finish updating.`}var Ri,Ai,Ei,Mi={a:0,b:1,rc:2},Ci=/^(\d+)\.(\d+)\.(\d+)(?:(a|b|rc)(\d+))?$/;function Ii(e){if("string"!=typeof e)return;const t=Ci.exec(e.trim());if(!t)return;const n=void 0===t[4]?3:Mi[t[4]];return[Number(t[1]),Number(t[2]),Number(t[3]),n,Number(t[5]??0)]}function Li(e,t){const n=Ii(e),i=Ii(t);if(n&&i){for(let e=0;e<n.length;e++)if(n[e]!==i[e])return n[e]-i[e];return 0}}var Di,Pi=0,Oi=0,Fi=!1;async function Ni(){const e=Ei,n=++Pi;let i;try{if("function"==typeof(null==e?void 0:e.callWS)){const t=await e.callWS({type:"manifest/get",integration:"apollo_mmwave"});i=null==t?void 0:t.version}}catch{i=void 0}if(n!==Pi)return;const o=function(e,t,n){if("string"!=typeof e)return;const i=Li(t,e);if(void 0===i||0===i)return;const o=void 0!==n&&0!==(Li(n,e)??0);return i>0&&!o?{kind:"restart",lines:[Ti(e,t)]}:{kind:"reload",lines:[zi(e,t),"In the Home Assistant app, if Reload does not help, close the app fully and open it again."]}}(i,t,Ai);void 0===Ai&&"string"==typeof i&&Ii(i)&&(Ai=i),JSON.stringify(o)!==JSON.stringify(Ri)&&(Ri=o,Hi())}function Ui(){const e=Di;Di=void 0;try{var t,n;null==e||null===(n=(t=e.connection).removeEventListener)||void 0===n||n.call(t,"ready",e.listener)}catch{}}var ji=Symbol.for("apollo_mmwave.version_notice.v1");function Bi(){const e=globalThis;return Array.isArray(e[ji])||(e[ji]=[]),e[ji]}function Hi(){for(const e of[...Bi()])try{e.changed()}catch{}}function Wi(e){const t={own:()=>Ri,changed:e};let n=!0;return Bi().push(t),Oi++,{get notice(){if(n)for(const e of Bi()){if(e===t)return Ri;try{if(e.own())return}catch{}}},update(e){n&&function(e){if(!e)return;Ei=e;const t=e.connection;if(t&&"object"==typeof t){if((null==Di?void 0:Di.connection)===t)return;Ui();const e=()=>{Ni()};Di={connection:t,listener:e};try{var n;null===(n=t.addEventListener)||void 0===n||n.call(t,"ready",e)}catch{}Ni()}else Di||Fi||(Fi=!0,Ni())}(e)},close(){if(!n)return;n=!1,0===--Oi&&Ui();const e=Bi(),i=e.indexOf(t);i>=0&&e.splice(i,1),Hi()}}}var Zi,Gi="apollo_mmwave",qi="(?:_\\d+)?$",Ji=/(?:^|_)(?:ld2410|ld2412|ld2460)$/,Vi=/(?:^|_)zone_\d+$/,Xi=e=>({re:new RegExp(`(?:^|_)ld2450_${e}${qi}`),notAfter:[]}),Ki=(e,t=[Ji])=>({re:new RegExp(`(?:^|_)${e}${qi}`),notAfter:t}),Yi=(e,t,n)=>({slot:{kind:"scalar",key:e},domain:t,spellings:n}),Qi=e=>[Xi(e),Ki(e)],eo=e=>[Xi(e),Ki(e,[Ji,Vi])],to=[Yi("zone_type","select",Qi("zone_type")),Yi("multi_target_tracking","switch",Qi("multi_target_tracking")),Yi("timeout","number",Qi("timeout")),Yi("bluetooth","switch",[Xi("bluetooth")]),Yi("restart","button",[Xi("restart")]),Yi("factory_reset","button",[Xi("factory_reset"),(Zi="factory_reset_ld2450",{re:new RegExp(`(?:^|_)${Zi}${qi}`),notAfter:[]})]),Yi("presence","binary_sensor",[Xi("presence")]),Yi("moving_target","binary_sensor",[Xi("moving_target")]),Yi("still_target","binary_sensor",[Xi("still_target")]),Yi("presence_target_count","sensor",Qi("presence_target_count")),Yi("still_target_count","sensor",eo("still_target_count")),Yi("moving_target_count","sensor",eo("moving_target_count"))];for(let br=1;br<=3;br++)for(const e of["distance","direction","speed"])to.push({slot:{kind:"target",index:br-1,key:e},domain:"sensor",spellings:Qi(`target_${br}_${e}`)});for(let br=1;br<=3;br++){for(const e of["x1","y1","x2","y2"])to.push({slot:{kind:"zone",index:br-1,key:e},domain:"number",spellings:Qi(`zone_${br}_${e}`)});for(const e of["all","still","moving"])to.push({slot:{kind:"zone",index:br-1,key:`${e}_target_count`},domain:"sensor",spellings:Qi(`zone_${br}_${e}_target_count`)})}function no(e,t,n){for(let i=0;i<t.length;i++){const{re:o,notAfter:s}=t[i],r=o.exec(e);if(r){if(n){if(0!==r.index)continue}else{const t=e.slice(0,r.index);if(s.some(e=>e.test(t)))continue}return i}}return-1}function io(e,t,n){const i=[];for(const o of to){if(o.domain!==e)continue;const s=no(t,o.spellings,n);s>=0&&i.push([o,s])}return i}function oo(e,t,n){"scalar"===t.kind?e[t.key]=n:"target"===t.kind?e.targets[t.index][t.key]=n:e.zones[t.index][t.key]=n}var so=/* @__PURE__ */new WeakMap;function ro(e,t){let n=so.get(e.entities);n||(n=/* @__PURE__ */new Map,so.set(e.entities,n));const i=n.get(t);if(i)return i;const o={targets:Array.from({length:3},()=>({})),zones:Array.from({length:3},()=>({}))},s=/* @__PURE__ */new Map,r=Ie(e,t);for(const[a,l]of ye(e.entities,t)){if(l.platform===Gi)continue;const e=a.indexOf("."),t=a.slice(0,e),n=a.slice(e+1),i=void 0!==r&&n.startsWith(`${r}_`)?n.slice(r.length+1):void 0;let d=void 0!==i?io(t,i,!0):[];0===d.length&&(d=io(t,n,!1));for(const[r,l]of d){const e=s.get(r);void 0!==e&&e<=l||(s.set(r,l),oo(o,r.slot,a))}}return n.set(t,o),o}function ao(e){return e.zones.flatMap(e=>[e.x1,e.y1,e.x2,e.y2]).filter(e=>void 0!==e)}var lo=/^binary_sensor\..+_zone_(\d+)_presence(?:_\d+)?$/;function co(e){const t=lo.exec(e);return t?parseInt(t[1],10):Number.POSITIVE_INFINITY}function uo(e,t){const n=[];for(const[i,o]of ye(e.entities,t))i.startsWith("binary_sensor.")&&(o.platform===Gi||!o.platform&&lo.test(i))&&n.push(i);return n.sort((e,t)=>{const n=co(e),i=co(t);return n===i?0:n<i?-1:1})}function ho(e){return void 0!==e&&"unavailable"!==e.state}function _o(e){return ho(e)&&"unknown"!==e.state}function po(e,t){var n;const i=t.zone_type,o=i?e.states[i]:void 0;if(!i||!ho(o))return;const s=o.state;if("Disabled"===s||"unknown"===s)return;const r=null===(n=o.attributes)||void 0===n?void 0:n.options,a={setting:"zone_type",name:"Zone Type",entityId:i,fix:Array.isArray(r)&&!r.includes("Disabled")?void 0:{domain:"select",service:"select_option",data:{entity_id:i,option:"Disabled"},label:"Set Zone Type to Disabled",clause:"sets Zone Type to Disabled",progress:"Setting Zone Type to Disabled..."}};if("Detection"===s){const n=function(e,t){const n=ao(t);return 0!==n.length&&n.every(t=>{var n;const i=null===(n=e.states[t])||void 0===n?void 0:n.state;return void 0!==i&&""!==i.trim()&&0===Number(i)})}(e,t)?"None are set, so it reports nobody and the zone map stays empty.":"Anyone outside them is missing from the zone map.";return{...a,level:"warning",text:`Zone Type is Detection. This radar only reports people inside its built-in zones. ${n}`,hint:"Zone Type should be Disabled. The zone map replaces the radar's built-in zones."}}return"Filter"===s?{...a,level:"note",text:"Zone Type is Filter. This radar ignores people inside its built-in zones. Disabled is recommended because the zone map replaces them."}:{...a,level:"note",text:`Zone Type is ${s}. Disabled is recommended because the zone map replaces the radar's built-in zones.`}}function vo(e,t){var n;const i=t.multi_target_tracking;if(i&&"off"===(null===(n=e.states[i])||void 0===n?void 0:n.state))return{setting:"multi_target_tracking",name:"Multi Target Tracking",entityId:i,level:"warning",text:"Multi Target Tracking is off. Only one person is tracked.",fix:{domain:"switch",service:"turn_on",data:{entity_id:i},label:"Turn on Multi Target Tracking",clause:"turns on Multi Target Tracking",progress:"Turning on Multi Target Tracking..."}}}var fo="After the change, automations and templates that use these sensors read mm.",go=Object.freeze({in:"inches",cm:"centimeters",m:"meters",ft:"feet",yd:"yards",km:"kilometers",mi:"miles",nmi:"nautical miles"});var mo=/(?:^|_)ld2460_presence(?:_\d+)?$/,yo=[[hi,"x"],[_i,"y"],[/(?:^|_)ld2460_target_(\d+)_distance(?:_\d+)?$/,"distance"],[/(?:^|_)ld2460_target_(\d+)_angle(?:_\d+)?$/,"angle"]],$o=/* @__PURE__ */new WeakMap;function bo(e,t){let n=$o.get(e.entities);n||(n=/* @__PURE__ */new Map,$o.set(e.entities,n));const i=n.get(t);if(i)return i;const o={targets:Array.from({length:5},()=>({}))};for(const[s,r]of ye(e.entities,t)){if("apollo_mmwave"===r.platform)continue;const e=s.indexOf("."),t=s.slice(0,e),n=s.slice(e+1);if("binary_sensor"!==t){if("sensor"===t)if(pi.test(n))o.installation_mode??(o.installation_mode=s);else if(vi.test(n))o.target_count??(o.target_count=s);else for(const[i,r]of yo){const e=i.exec(n);if(!e)continue;const t=o.targets[parseInt(e[1],10)-1];t&&(t[r]??(t[r]=s));break}}else mo.test(n)&&(o.presence??(o.presence=s))}return n.set(t,o),o}function wo(e,t){return`The radar sees ${e} people, but Home Assistant has X and Y for only ${t} of its 5 targets, so the zone map shows ${t}. The device's firmware sets which targets it sends.`}function xo(e,t){if(!t)return[];const n=bo(e,t);return[n.installation_mode,n.target_count,...n.targets.flatMap(e=>[e.x,e.y])].filter(e=>void 0!==e)}var ko=["Start Zone 1","End Zone 1","End Zone 2","End Zone 3"];function So(e){return String(Number(e.toFixed(2)))}function zo(e){return e.length<3?e.join(" and "):`${e.slice(0,-1).join(", ")}, and ${e[e.length-1]}`}function To(e){return[...e.move_threshold,...e.still_threshold].filter(e=>!!e)}function Ro(e){return[e.zone_1_start,e.end_zone_1,e.end_zone_2,e.end_zone_3]}function Ao(e,t){return[e.engineering_mode,e.query_params,...To(e),e.max_move_distance,e.max_still_distance,e.radar_timeout,..."ld2410"===t.key?Ro(e):[]].filter(e=>!!e)}function Eo(e,t,n){var i;const o=t.engineering_mode;if(o&&"idle"===n&&"on"===(null===(i=e.states[o])||void 0===i?void 0:i.state))return{setting:"engineering_mode",name:"Radar Engineering Mode",entityId:o,level:"note",text:"Radar Engineering Mode is on, so every gate's energy is saved to the database about once a second.",hint:"Turn it off when you finish tuning. The Gate Energy chart needs it only while you watch it.",fix:{domain:"switch",service:"turn_off",data:{entity_id:o},label:"Turn off Radar Engineering Mode",clause:"turns off Radar Engineering Mode",progress:"Turning off Radar Engineering Mode...",failure:"Could not turn Radar Engineering Mode off"}}}function Mo(e,t){const n=t=>{var n;return!!t&&"unknown"===(null===(n=e.states[t])||void 0===n?void 0:n.state)},i=[["gate thresholds",To(t)],["detection range",[t.max_move_distance,t.max_still_distance]],["timeout",[t.radar_timeout]]],o=i.filter(([,e])=>e.some(n)).map(([e])=>e);if(0===o.length)return;const s=i.flatMap(([,e])=>e).find(n),r=t.query_params&&ho(e.states[t.query_params])?t.query_params:void 0;return{setting:"settings_unread",name:"the radar's settings",entityId:s,level:"note",text:`The radar has not reported its ${zo(o)} yet, so those settings are blank.`,hint:r?"This only asks the radar to send them. Nothing on the radar changes.":"Press Query Params on the radar's device page to make it send them.",fix:r?{domain:"button",service:"press",data:{entity_id:r},label:Kt,clause:"asks the radar for its settings",progress:Yt,failure:"Could not ask the radar for its settings",settleMs:3e3,noAnswer:"The radar has not sent its settings yet. Try again in a moment."}:void 0}}function Co(e,t,n){const i=function(e,t){return Ro(t).map((t,n)=>{const i=pt(e,t);if(!t||void 0===i)return;const o=vt(e,t,"cm");return{entityId:t,label:ko[n],cm:_t(i,o,"cm"),text:`${So(i)} ${o}`,unit:o}})}(e,t),o=[],s=/* @__PURE__ */new Set,r=[];for(let c=1;c<=3;c++){const e=i[c-1],t=i[c];e&&t&&((1===c?e.cm>t.cm:t.cm<=e.cm)&&(s.add(c),r.push({entityId:t.entityId,line:1===c?`Zone 1 can never turn on. ${e.label} (${e.text}) must be smaller than ${t.label} (${t.text}).`:`Zone ${c} can never turn on. ${t.label} (${t.text}) must be larger than ${e.label} (${e.text}).`})))}r.length&&o.push({setting:"zone_order",name:"the zone distances",entityId:r[0].entityId,level:"warning",text:r.map(e=>e.line).join(" "),hint:"Each zone starts where the one before it ends. Change the distances on the Zone Config card."});const a=function(e,t){var n;const i=[pt(e,t.max_move_distance),pt(e,t.max_still_distance)].filter(e=>void 0!==e);if(0===i.length)return;const o=ft(t.gate_size?null===(n=e.states[t.gate_size])||void 0===n?void 0:n.state:void 0),s=void 0!==o&&o>0?o:.75;return Math.max(...i)*s*100}(e,t);if(void 0===a)return o;const l=e=>`about ${So(_t(a,"cm",e))} ${e}`,d=[];for(let c=1;c<=3;c++){const e=i[c-1],t=i[c];!s.has(c)&&t&&(e&&e.cm>=a?d.push({entityId:e.entityId,line:`Zone ${c} starts at ${e.text}, past the radar's reach of ${l(e.unit)}, so it can never turn on.`,never:!0}):t.cm>a&&d.push({entityId:t.entityId,line:`Zone ${c} ends at ${t.text}, past the radar's reach of ${l(t.unit)}.`,never:!1}))}if(d.length){const[e,t]=n.rangeLabels;o.push({setting:"zone_reach",name:"the zone distances",entityId:d[0].entityId,level:d.some(e=>e.never)?"warning":"note",text:d.map(e=>e.line).join(" "),hint:`The reach comes from ${e} and ${t}. Lower the zone distances, or raise those gates on the Detection Range card.`})}return o}function Io(e,t,n){const i=pt(e,t.max_move_distance),o=pt(e,t.max_still_distance);if(void 0===i||void 0===o||o<i)return;const[s,r]=n.rangeLabels,a=`The ${n.label} only detects people from ${r} out to ${s}`;return{setting:"gate_range",name:r,entityId:t.max_still_distance,level:"warning",text:o>i?`${r} (${So(o)}) is above ${s} (${So(i)}). ${a}, so it may never see anyone.`:`${r} and ${s} are both ${So(o)}. ${a}, so it covers one narrow band.`,hint:`Set ${r} lower than ${s} on the Detection Range card.`}}var Lo="apollo-radar-setup-card";async function Do(e,t){var n;return"not_found"===((null==t?void 0:t.code)??(null==t||null===(n=t.error)||void 0===n?void 0:n.code))?"Home Assistant could not find this setting. Reload the page and try again.":qt(e,t)}var Po=class extends ue{constructor(...e){super(...e),this._unitsBusy=!1,this._serial=0,this._jobWatch=new Si(()=>this.requestUpdate()),this._unitsRead=0}setConfig(e){this._config=e,this._radarConfig={type:e.type,...e.device_id?{device_id:e.device_id}:{}}}getCardSize(){return 2}static getStubConfig(e){const t=`custom:${Lo}`;if(!e)return{type:t};const n=Object.keys(e.devices??{}),i=n.find(t=>wi(e,t));if(i)return{type:t,device_id:i};const o=n.find(t=>gi(e,t));if(o)return{type:t,device_id:o,radar:"ld2460"};const s=n.find(t=>void 0!==je(e,t));return s?{type:t,device_id:s,radar:"gate"}:{type:t}}connectedCallback(){super.connectedCallback(),this._watchJobs();const e=Wi(()=>{this._version===e&&(this._versionNotice=e.notice)});this._version=e,e.update(this.hass),this._versionNotice=e.notice,this._unitsReadFor=void 0,this._watchUnits()}disconnectedCallback(){var e;super.disconnectedCallback(),this._jobWatch.close(),this._endSettling(!1),null===(e=this._version)||void 0===e||e.close(),this._version=void 0,this._versionNotice=void 0}_isGate(){var e;return"gate"===(null===(e=this._config)||void 0===e?void 0:e.radar)}_isLd2460(){var e;return"ld2460"===(null===(e=this._config)||void 0===e?void 0:e.radar)}_resolve(){if(this._isGate()&&this.hass&&this._radarConfig)return this._resolved=et(this._resolved,this.hass,this._radarConfig),this._resolved}_watchJobs(){var e;this.isConnected&&this._isGate()?this._jobWatch.watch(this.hass,null===(e=this._config)||void 0===e?void 0:e.device_id):this._jobWatch.close()}_status(){var e;const t=null===(e=this._config)||void 0===e?void 0:e.device_id;if(this._isLd2460())return function(e,t){var n;if(!t)return{kind:"no_device"};const i=bo(e,t),o=i.targets.map(e=>e.x).filter(e=>void 0!==e);if(!i.installation_mode&&0===o.length)return{kind:"nothing_to_check"};if(!xo(e,t).some(t=>ho(e.states[t])))return{kind:"offline"};const s=[],r=i.installation_mode?e.states[i.installation_mode]:void 0;var a;i.installation_mode&&ho(r)&&!("side"===(a=r.state)||"top"===a?a:void 0)&&s.push({setting:"installation_mode",name:"Installation Mode",entityId:i.installation_mode,level:"warning",text:"The LD2460 has not answered the installation mode query, so ESPHome treats it as side mounted. Check the radar's TX wire, or restart the device. Until it answers, the zone map uses the mount chosen under Map settings."});const l=i.target_count?Number(null===(n=e.states[i.target_count])||void 0===n?void 0:n.state):NaN,d=i.targets.filter(e=>e.x&&e.y).length;return i.target_count&&Number.isFinite(l)&&Math.round(l)>d&&s.push({setting:"target_count",name:"Target Count",entityId:i.target_count,level:"note",text:wo(Math.round(l),d)}),{kind:"checked",problems:s}}(this.hass,t);const n=this._resolve();return n?function(e,t,n,i,o){if(!t)return{kind:"no_device"};const s=i?Ao(n,i):[];if(!i||0===s.length)return{kind:"nothing_to_check"};const r=s.map(t=>e.states[t]);if(!r.some(ho))return{kind:"offline"};const a=[Eo(e,n,o),Mo(e,n),..."ld2410"===i.key?Co(e,n,i):[Io(e,n,i)]].filter(e=>void 0!==e);if(a.length)return{kind:"checked",problems:a};const l=n.engineering_mode?e.states[n.engineering_mode]:void 0;return"unknown"===o&&"on"===(null==l?void 0:l.state)?{kind:"checking"}:r.some(_o)?{kind:"checked",problems:a}:{kind:"waiting"}}(this.hass,t,n.map,n.profile,this._jobWatch.activity):function(e,t){if(!t)return{kind:"no_device"};const n=ro(e,t),i=[n.zone_type,n.multi_target_tracking].filter(e=>void 0!==e);if(0===i.length)return{kind:"nothing_to_check"};const o=i.map(t=>e.states[t]);if(!o.some(ho))return{kind:"offline"};if(!o.some(_o))return{kind:"waiting"};const s=[po(e,n),vo(e,n)].filter(e=>void 0!==e);return void 0===n.zone_type||_o(e.states[n.zone_type])?{kind:"checked",problems:s}:s.length?{kind:"checked",problems:s,zoneTypeUnread:!0}:{kind:"waiting"}}(this.hass,t)}_watchUnits(){var e,t;const n=this.hass,i=null===(e=this._config)||void 0===e?void 0:e.device_id;if(!n||!i||this._isGate()||this._isLd2460()||!0!==(null===(t=n.user)||void 0===t?void 0:t.is_admin)||"function"!=typeof n.callWS)return this._unitsReadFor=void 0,void(this._unitRows=void 0);const o=this._unitsReadFor;o&&o.deviceId===i&&o.entities===n.entities||(this._unitsReadFor={deviceId:i,entities:n.entities},this._readUnits())}async _readUnits(){var e;const t=this.hass,n=null===(e=this._config)||void 0===e?void 0:e.device_id;if(!(null==t?void 0:t.callWS)||!n)return;const i=++this._unitsRead;try{var o;const e=await t.callWS({type:"apollo_mmwave/target_units/get",device_id:n});if(i!==this._unitsRead||(null===(o=this._config)||void 0===o?void 0:o.device_id)!==n)return;this._unitRows=Array.isArray(null==e?void 0:e.targets)?e.targets:void 0}catch{var s;i===this._unitsRead&&(null===(s=this._config)||void 0===s?void 0:s.device_id)===n&&(this._unitRows=void 0)}}async _showInMm(){var e;const t=this.hass,n=null===(e=this._config)||void 0===e?void 0:e.device_id;if(!(null==t?void 0:t.callWS)||!n||this._unitsBusy)return;const i=this._serial;this._unitsBusy=!0,this._unitsError=void 0;try{await t.callWS({type:"apollo_mmwave/target_units/set",device_id:n}),i===this._serial&&await this._readUnits()}catch(o){const e=await async function(e,t){var n;const i=(null==t?void 0:t.code)??(null==t||null===(n=t.error)||void 0===n?void 0:n.code);return"not_loaded"===i?"Apollo mmWave Dashboard is not loaded. Reload the page and try again.":"not_found"===i?Pt:qt(e,t)}(t,o);i===this._serial&&(this._unitsError=`Could not change the Target X and Y units: ${e}`)}finally{i===this._serial&&(this._unitsBusy=!1)}}_watchedIds(){var e,t;if(this._isLd2460())return xo(this.hass,null===(e=this._config)||void 0===e?void 0:e.device_id);const n=this._resolve();return n?(i=n.map,(o=n.profile)?[...Ao(i,o),i.gate_size].filter(e=>!!e):[]):function(e,t){if(!t)return[];const n=ro(e,t);return[n.zone_type,n.multi_target_tracking,...ao(n)].filter(e=>void 0!==e)}(this.hass,null===(t=this._config)||void 0===t?void 0:t.device_id);var i,o}shouldUpdate(e){if(1!==e.size||!e.has("hass"))return!0;const t=e.get("hass");return!(t&&this.hass&&this._config)||(t.entities!==this.hass.entities||t.devices!==this.hass.devices||t.connection!==this.hass.connection||this._watchedIds().some(e=>t.states[e]!==this.hass.states[e]))}willUpdate(e){var t;if(e.has("_config")||e.has("hass")){var n;const e=null===(n=this._config)||void 0===n?void 0:n.device_id;e!==this._deviceId&&(this._deviceId=e,this._serial++,this._endSettling(!1),this._busy=void 0,this._error=void 0,this._note=void 0,this._unitsBusy=!1,this._unitsError=void 0,this._unitRows=void 0),this._watchJobs(),this._watchUnits()}if(e.has("hass")&&(null===(t=this._version)||void 0===t||t.update(this.hass)),!this.hass)return;const i=this._problems(),o=e=>i.some(t=>t.setting===e);this._error&&!i.length&&(this._error=void 0),this._note&&!o(this._note.setting)&&(this._note=void 0),this._settling&&!this._settling.problems.some(e=>o(e.setting))&&this._endSettling(!1)}_problems(){if(!this.hass)return[];const e=this._status();return"checked"===e.kind?e.problems:[]}async _apply(e){const t=this.hass,n=e.filter(e=>e.fix);if(!(null==t?void 0:t.callService)||this._busy||0===n.length)return;const i=this._serial;this._error=void 0,this._note=void 0,this._busy=n.length>1?"Applying recommended settings...":n[0].fix.progress;const o=t,s=await Promise.allSettled(n.map(e=>Ut(o,e.fix.domain,e.fix.service,e.fix.data))),r=[];for(let d=0;d<s.length;d++){const e=s[d];if("rejected"===e.status){const i=n[d].fix.failure??`Could not change ${n[d].name}`;r.push(`${i}: ${await Do(t,e.reason)}`)}}if(i!==this._serial)return;this._error=r.length?r.join(" "):void 0;const a=n.filter((e,t)=>"fulfilled"===s[t].status&&void 0!==e.fix.settleMs),l=this._problems();if(a.some(e=>l.some(t=>t.setting===e.setting))){const e=Math.max(...a.map(e=>e.fix.settleMs));return void(this._settling={problems:a,timer:setTimeout(()=>{i===this._serial&&this._endSettling(!0)},e)})}this._busy=void 0}_endSettling(e){var t;const n=this._settling;if(!n)return;if(clearTimeout(n.timer),this._settling=void 0,this._busy=void 0,!e||!this.hass)return;const i=this._problems(),o=n.problems.find(e=>i.some(t=>t.setting===e.setting));(null==o||null===(t=o.fix)||void 0===t?void 0:t.noAnswer)&&(this._note={setting:o.setting,text:o.fix.noAnswer})}render(){if(!this.hass||!this._config)return J;const e=this._status();return Z`
      <ha-card .header=${this._config.title??"Radar setup"}>
        <div class="wrap">
          ${this._renderSubtitle()} ${this._renderVersionNotice()} ${this._renderBody(e)}
          ${this._renderUnits(e)}
        </div>
      </ha-card>
    `}_renderVersionNotice(){const e=this._versionNotice;if(!e)return J;const[t,...n]=e.lines;return Z`
      <div class="version-notice" role="status">
        <p>${t}</p>
        ${"reload"===e.kind?Z`<div class="buttons">
              <button type="button" class="primary" @click=${()=>{window.location.reload()}}>
                ${"Reload"}
              </button>
            </div>`:J}
        ${n.map(e=>Z`<p class="hint">${e}</p>`)}
      </div>
    `}_renderSubtitle(){var e,t,n;const i=null===(e=this._config)||void 0===e?void 0:e.device_id,o=i?null===(t=this.hass)||void 0===t?void 0:t.devices[i]:void 0,s=(null==o?void 0:o.name_by_user)||(null==o?void 0:o.name);if(!this._isGate()){const e=this._isLd2460()?"LD2460":"LD2450";return s?Z`<div class="subtitle">${e} · ${s}</div>`:J}const r=[null===(n=this._resolve())||void 0===n||null===(n=n.profile)||void 0===n?void 0:n.label,s].filter(Boolean).join(" · ");return r?Z`<div class="subtitle">${r}</div>`:J}_renderBody(e){switch(e.kind){case"no_device":return Z`<p class="hint">${"Add device_id to this card's configuration to check the radar's settings."}</p>`;case"nothing_to_check":{const e=this._isGate()?"This device has no gate radar settings to check.":this._isLd2460()?"This device has no LD2460 Installation Mode or targets to check.":"This device has no Zone Type or Multi Target Tracking setting to check.";return Z`<p class="hint">${e}</p>`}case"offline":return Z`<p class="hint">${"Radar is offline. Its settings are checked once it reconnects."}</p>`;case"waiting":return Z`<p class="hint">${"Waiting for the radar to report its settings."}</p>`;case"checking":return Z`<p class="hint">${"Checking the radar's settings..."}</p>`;case"checked":return e.problems.length?this._renderProblems(e.problems,!!e.zoneTypeUnread):Z`<p class="ok">${"Radar settings look good."}</p>`}}_renderUnits(e){var t;if(this._isGate()||this._isLd2460()||"no_device"===e.kind||"nothing_to_check"===e.kind)return J;if(!0!==(null===(t=this.hass)||void 0===t||null===(t=t.user)||void 0===t?void 0:t.is_admin))return J;const n=function(e){const t=function(e){return(e??[]).filter(e=>e.convertible&&!e.picked&&"mm"!==e.unit)}(e);if(0===t.length)return;const n=[...new Set(t.map(e=>String(e.unit)))].map(e=>Object.prototype.hasOwnProperty.call(go,e)?go[e]:e).join(" and "),i=t.some(e=>Array.isArray(e.used_by)&&e.used_by.length>0);return{text:`Home Assistant shows this radar's Target X and Y in ${n}. The zone map reads them either way. In mm they match the radar's built-in zone corners and Apollo's zone guides.`,hint:i?`${fo} An automation, a script or a helper uses them: check any number it compares them to.`:fo}}(this._unitRows);return n?Z`
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
          ${this._unitsBusy?Z`<p class="hint">${"Switching Target X and Y to mm..."}</p>`:J}
          ${this._unitsError?Z`<p class="error">${this._unitsError}</p>`:J}
        </div>
      </div>
    `:J}_renderProblems(e,t){var n;const i=e.filter(e=>e.fix),o=!this._isGate()&&!this._isLd2460()&&i.length>1,s=!!(null===(n=this.hass)||void 0===n?void 0:n.callService)&&!this._busy;return Z`
      <div class="problems">
        ${e.map(e=>Z`
            <div class="problem ${e.level}">
              <p class=${e.level}>${e.text}</p>
              ${e.hint?Z`<p class="hint">${e.hint}</p>`:J}
              ${e.fix&&!o?Z`<div class="buttons">
                    <button
                      type="button"
                      class="primary"
                      ?disabled=${!s}
                      @click=${()=>this._apply([e])}
                    >
                      ${e.fix.label}
                    </button>
                  </div>`:J}
            </div>
          `)}
        ${o?Z`<div class="combined">
              <div class="buttons">
                <button
                  type="button"
                  class="primary"
                  ?disabled=${!s}
                  @click=${()=>this._apply(i)}
                >
                  ${"Use recommended settings"}
                </button>
              </div>
              <p class="hint">${function(e){const t=e.map(e=>e.clause).join(" and ");return`${t.charAt(0).toUpperCase()}${t.slice(1)}.`}(i.map(e=>e.fix))}</p>
            </div>`:J}
        ${t?Z`<p class="hint">${"Waiting for the radar to report its Zone Type."}</p>`:J}
        <div class="status" aria-live="polite">
          ${this._busy?Z`<p class="hint">${this._busy}</p>`:J}
          ${this._note?Z`<p class="hint">${this._note.text}</p>`:J}
          ${this._error?Z`<p class="error">${this._error}</p>`:J}
        </div>
      </div>
    `}};Po.styles=a`
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
  `,Et([ve({attribute:!1})],Po.prototype,"hass",void 0),Et([fe()],Po.prototype,"_config",void 0),Et([fe()],Po.prototype,"_busy",void 0),Et([fe()],Po.prototype,"_error",void 0),Et([fe()],Po.prototype,"_note",void 0),Et([fe()],Po.prototype,"_versionNotice",void 0),Et([fe()],Po.prototype,"_unitRows",void 0),Et([fe()],Po.prototype,"_unitsBusy",void 0),Et([fe()],Po.prototype,"_unitsError",void 0),lt(Lo,Po),dt(Lo,"Apollo Radar Setup","Checks an Apollo radar's settings and offers one-click fixes: the LD2450 on an R PRO-1 or MTR-1, or the gate radar on an MSR-1, MSR-2 or R PRO-1.");var Oo,Fo,No="apollo-radar-slider-row",Uo="apollo-radar-slider-lock-row",jo=3e5,Bo="Unlock",Ho=/* @__PURE__ */new Map,Wo=-1/0,Zo=!1;function Go(e){let t=Ho.get(e);return t||(t={unlocked:!1,deadline:0,drags:/* @__PURE__ */new Map,lastTry:-1/0,lastReminder:-1/0,listeners:/* @__PURE__ */new Set},Ho.set(e,t)),t}function qo(e,t){for(const n of[...e.listeners])n(t)}function Jo(e){clearTimeout(e.timer),e.timer=void 0,e.unlocked&&(e.unlocked=!1,qo(e,"lock"))}function Vo(e,t){t.deadline=Date.now()+jo,clearTimeout(t.timer),t.timer=setTimeout(()=>Xo(e),jo)}function Xo(e){const t=Ho.get(e);if(!(null==t?void 0:t.unlocked))return;const n=t.deadline-Date.now();if(n>0)return clearTimeout(t.timer),void(t.timer=setTimeout(()=>Xo(e),n));t.drags.size>0||Jo(t)}function Ko(){for(const e of[...Ho.keys()])Xo(e)}function Yo(e){for(const[t,n]of Ho){let i=!1;for(const[t,o]of n.drags)e(t,o)&&(n.drags.delete(t),i=!0);!i||n.drags.size>0||n.unlocked&&Date.now()>=n.deadline&&setTimeout(()=>Xo(t),0)}}function Qo(e){Yo(t=>t===e.pointerId)}function es(){Yo((e,t)=>"touch"!==t)}function ts(){if("hidden"===document.visibilityState)for(const e of Ho.values())e.drags.clear();else Ko()}function ns(){Wo=Date.now()}function is(){Zo||(Zo=!0,window.addEventListener("pointerup",Qo,{capture:!0,passive:!0}),window.addEventListener("pointercancel",Qo,{capture:!0,passive:!0}),window.addEventListener("contextmenu",es,{capture:!0,passive:!0}),document.addEventListener("visibilitychange",ts),window.addEventListener("pageshow",Ko),window.addEventListener("scroll",ns,{passive:!0}))}function os(e){var t;return(null===(t=Ho.get(e))||void 0===t?void 0:t.unlocked)??!1}function ss(e,t){const n=Ho.get(e);t?(null==n?void 0:n.listeners.size)&&(n.unlocked=!0,n.lastTry=-1/0,n.lastReminder=-1/0,Vo(e,n),qo(n,"lock")):n&&Jo(n)}function rs(e,t){is();const n=Go(e);clearTimeout(n.leaveTimer),n.leaveTimer=void 0,n.listeners.add(t);let i=!0;return()=>{i&&(i=!1,n.listeners.delete(t),n.listeners.size>0||(clearTimeout(n.leaveTimer),n.leaveTimer=setTimeout(()=>{n.listeners.size>0||(Jo(n),Ho.get(e)===n&&Ho.delete(e))},2e3)))}}function as(e){if(!e)return!1;const{mode:t,min:n,max:i,step:o}=e.attributes;return"slider"===t||"auto"===t&&(Number(i)-Number(n))/Number(o)<=256}var ls=/* @__PURE__ */new Set(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"]);function ds(e){return e.composedPath().some(e=>e instanceof Element&&("ha-slider"===e.localName||"slider"===e.getAttribute("role")||"input"===e.localName&&"range"===e.type))}function cs(e){return`apollo-mmwave-sliders-${e}`}function us(e,t,n){e.dispatchEvent(new CustomEvent(t,{bubbles:!0,composed:!0,detail:n}))}var hs=class extends ue{constructor(...e){super(...e),this._nudge=!1,this._serial=0,this._keyCapture={handleEvent:e=>this._onKey(e),capture:!0},this._changeCapture={handleEvent:e=>this._onChange(e),capture:!0},this._downCapture={handleEvent:e=>this._onSliderDown(e),capture:!0}}setConfig(e){var t;if(!(null==e?void 0:e.entity)||!e.device_id)throw new Error("Apollo mmWave Dashboard: a slider row needs entity and device_id.");const n=e.device_id!==(null===(t=this._config)||void 0===t?void 0:t.device_id);this._config=e,n&&this.isConnected&&this._watch(),this._buildRow()}connectedCallback(){super.connectedCallback(),this._watch()}disconnectedCallback(){var e;super.disconnectedCallback(),null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=void 0,clearTimeout(this._nudgeTimer),this._nudge=!1,this._gesture=void 0}_watch(){var e;null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=this._config?rs(this._config.device_id,e=>{"lock"===e&&this.requestUpdate()}):void 0,this.requestUpdate()}async _buildRow(){const e=++this._serial,t=await function(){const e=window.loadCardHelpers;return"function"!=typeof e?Promise.resolve(void 0):(e!==Oo&&(Oo=e,Fo=Promise.resolve().then(()=>e()).catch(()=>{})),Fo)}(),n=this._config;if(e!==this._serial||!n)return;const i={...n};delete i.type,delete i.device_id;let o=null;try{o=(null==t?void 0:t.createRowElement({color:"state",...i}))??null}catch{o=null}o&&(o.hass=this.hass),this._row=o}shouldUpdate(e){if(e.has("hass")&&this._row&&(this._row.hass=this.hass),1!==e.size||!e.has("hass"))return!0;const t=e.get("hass");if(!t||!this.hass||!this._config)return!0;const n=this._config.entity;return t.states[n]!==this.hass.states[n]||t.localize!==this.hass.localize}_locked(){var e;const t=this._config;return!!t&&!!this._row&&!os(t.device_id)&&as(null===(e=this.hass)||void 0===e?void 0:e.states[t.entity])}render(){if(!this._config)return J;const e=this._locked(),t=this._row?this._row:null===this._row?this._renderFallback():J;return Z`
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
            ></div>`:J}
      </div>
    `}_renderFallback(){var e,t,n;const i=this._config,o=null===(e=this.hass)||void 0===e?void 0:e.states[i.entity],s=i.name??(null==o?void 0:o.attributes.friendly_name)??i.entity,r=o?(null===(t=(n=this.hass).formatEntityState)||void 0===t?void 0:t.call(n,o))??o.state:"";return Z`<div class="fallback"><span>${s}</span><span>${r}</span></div>`}_inSliderZone(e){var t;const n=null===(t=this._row)||void 0===t||null===(t=t.shadowRoot)||void 0===t?void 0:t.querySelector("ha-slider");if(!n)return!0;const i=n.getBoundingClientRect();return!i.width||("rtl"===getComputedStyle(this).direction?e<=i.right+8:e>=i.left-8)}_onDown(e){!e.isPrimary||e.button>0||(this._gesture={id:e.pointerId,x:e.clientX,y:e.clientY,slider:this._inSliderZone(e.clientX),moved:!1})}_onMove(e){const t=this._gesture;if(!t||t.id!==e.pointerId||t.moved)return;if("touch"!==e.pointerType&&0===e.buttons)return void(this._gesture=void 0);const n=Math.abs(e.clientX-t.x),i=Math.abs(e.clientY-t.y);Math.max(n,i)<10||(t.moved=!0,t.slider&&n>i&&this._try(!1))}_onCancel(){this._gesture=void 0}_onClick(e){const t=this._gesture;if(this._gesture=void 0,(null==t?void 0:t.moved)||e.button>0)return;const n=this._config;var i;(t?t.slider:this._inSliderZone(e.clientX))?function(e=Date.now()){return e-Wo<300}()||this._try(!1):(null===(i=this.hass)||void 0===i?void 0:i.states[n.entity])&&us(this,"hass-more-info",{entityId:n.entity})}_onKey(e){ls.has(e.key)&&this._locked()&&ds(e)&&(e.preventDefault(),e.stopPropagation(),e.repeat||this._try(!0))}_onChange(e){const t=this._config;if(t&&ds(e))return this._locked()?(e.stopPropagation(),void this._buildRow()):void function(e){const t=Ho.get(e);(null==t?void 0:t.unlocked)&&Vo(e,t)}(t.device_id)}_onSliderDown(e){const t=this._config;var n,i,o;!t||!e.isPrimary||e.button>0||this._locked()||!ds(e)||(n=t.device_id,i=e.pointerId,o=e.pointerType,is(),Go(n).drags.set(i,o))}_try(e){var t;const n=this._config,i=null===(t=this.hass)||void 0===t?void 0:t.states[n.entity];if(!i||"unavailable"===i.state)return;const o=n.device_id,s=function(e,t=!1,n=Date.now()){const i=Go(e),o=n-i.lastTry<=1e4;return i.lastTry=n,qo(i,"try"),(t||o)&&n-i.lastReminder>=4e3?(i.lastReminder=n,"remind"):"nudge"}(o,e);if(this._nudge=!0,clearTimeout(this._nudgeTimer),this._nudgeTimer=setTimeout(()=>this._nudge=!1,1200),us(this,"haptic","remind"===s?"warning":"light"),"remind"===s){us(this,"hass-notification",{id:cs(o),message:"These sliders are locked. Press Unlock above them to change one.",duration:6e3,action:{text:Bo,action:()=>ss(o,!0)}})}}};hs.styles=a`
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
  `,Et([ve({attribute:!1})],hs.prototype,"hass",void 0),Et([fe()],hs.prototype,"_config",void 0),Et([fe()],hs.prototype,"_row",void 0),Et([fe()],hs.prototype,"_nudge",void 0);var _s=class extends ue{constructor(...e){super(...e),this._flash=""}setConfig(e){var t;if(!(null==e?void 0:e.device_id))throw new Error("Apollo mmWave Dashboard: the slider lock row needs device_id.");const n=e.device_id!==(null===(t=this._config)||void 0===t?void 0:t.device_id);this._config=e,n&&this.isConnected&&this._watch()}connectedCallback(){super.connectedCallback(),this._watch()}disconnectedCallback(){var e;super.disconnectedCallback(),null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=void 0,clearTimeout(this._flashTimer),this._flash=""}_watch(){var e;null===(e=this._unwatch)||void 0===e||e.call(this),this._unwatch=this._config?rs(this._config.device_id,e=>{"lock"===e?this.requestUpdate():this._flashButton()}):void 0,this.requestUpdate()}_flashButton(){this._flash="flash-a"===this._flash?"flash-b":"flash-a",clearTimeout(this._flashTimer),this._flashTimer=setTimeout(()=>this._flash="",1200)}shouldUpdate(e){return 1!==e.size||!e.has("hass")}_toggle(){const e=this._config.device_id,t=!os(e);ss(e,t);us(this,"hass-notification",{id:cs(e),message:t?"Sliders unlocked. They lock again after 5 minutes without a change.":"Sliders locked."})}render(){if(!this._config)return J;const e=os(this._config.device_id);return Z`
      <div class="lock ${e?"unlocked":""}">
        <div class="icon" aria-hidden="true">
          <ha-icon .icon=${e?"mdi:lock-open-variant":"mdi:lock"}></ha-icon>
        </div>
        <div class="info" id="state">
          <div>${e?"Sliders unlocked":"Sliders locked"}</div>
          <div class="secondary">${e?"They lock again after 5 minutes without a change.":"A scroll cannot move them."}</div>
        </div>
        <button type="button" class=${this._flash} aria-describedby="state" @click=${this._toggle}>
          ${e?"Lock":Bo}
        </button>
      </div>
    `}};function ps(e,t){return e?[{entity:e,name:t}]:[]}function vs(e,t){return e?[{entity:e,name:t,slider:!0}]:[]}function fs(e,t,n,i){return e?[{entity:e,name:t,confirm:{text:n,action:i}}]:[]}function gs(e,t){return fs(e,"Factory Reset Radar",`Reset the ${t} radar to its factory settings? It restarts and forgets its own settings.`,"Reset")}function ms(e,t){return fs(e,"Restart Radar",`Restart the ${t} radar? It stops detecting for a few seconds while it starts up.`,"Restart")}_s.styles=a`
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
  `,Et([ve({attribute:!1})],_s.prototype,"hass",void 0),Et([fe()],_s.prototype,"_config",void 0),Et([fe()],_s.prototype,"_flash",void 0),lt(No,hs),lt(Uo,_s);var ys="Radar Bluetooth (HLK app)";function $s(e,t){if("ft"===t){const t=e/.3048;return`about ${t<3?Number(t.toFixed(1)):Math.round(t)} ft`}return`about ${Number(e.toFixed(e<1?2:1))} m`}function bs(e,t){return t.filter(t=>Ge(e,t.entity))}function ws(e){return`${xs(e)}Target Count: **${ks}**`}function xs(e){return`{% set n = states('${e}') %}`}var ks="{{ n | int if is_number(n) else n | capitalize }}";function Ss(e,t){const n=e.zones[t];return[...ps(n.x1,"X1"),...ps(n.y1,"Y1"),...ps(n.x2,"X2"),...ps(n.y2,"Y2")]}function zs(e,t){const n=e.zones[t];return[n.all_target_count,n.still_target_count,n.moving_target_count]}var Ts="| Target Count | All | Still | Moving |";function Rs(e){return[Ts,"| :-- | --: | --: | --: |",...e.map(({label:e,ids:t})=>`| ${e} | ${t.map(e=>e?`${xs(e)}${ks}`:"").join(" | ")} |`)].join("\n")}var As=/(?:^|_)ld2412_(?:engineering_mode|g\d{2}_(?:move|still)_threshold|presence)(?:_\d+)?$/,Es=/(?:^|_)(?:radar_engineering_mode|g\d_(?:move|still)_threshold)(?:_\d+)?$/,Ms=/* @__PURE__ */new Set(["sensor","switch","number","binary_sensor"]);function Cs(e,t){var n,i;if(!function(e,t){let n=!1,i=!1;for(const[,o]of ye(e.entities,t))if(n=!0,void 0!==o.platform&&(i=!0,"esphome"===o.platform))return!0;return n&&!i}(e,t))return;const o=null===(n=e.devices)||void 0===n?void 0:n[t],s=Ae(o);if(s)return s;if("apolloautomation"!==(null==o||null===(i=o.manufacturer)||void 0===i?void 0:i.toLowerCase()))return;const r=function(e,t){let n;for(const[i,o]of ye(e.entities,t)){if("apollo_mmwave"===o.platform)continue;const e=i.indexOf(".");if(!Ms.has(i.slice(0,e)))continue;const t=i.slice(e+1);if(As.test(t))return ze;!n&&Es.test(t)&&(n=Se)}return n}(e,t),a=gi(e,t),l=!a&&wi(e,t);return r||l||a?{profile:r,ld2450:l,ld2460:a,derived:!0}:void 0}function Is(e){return e.ld2450||e.ld2460}function Ls(e){return void 0!==e&&"unavailable"!==e.state}function Ds(e,t){return!!t&&Ls(e.states[t])}function Ps(e,t,n){const i=Be(e,t),o=[];return i&&o.push(i.engineering_mode,i.radar_timeout,i.max_move_distance,i.max_still_distance,i.radar_target,i.moving_target,i.still_target,i.detection_distance,...i.move_threshold,...i.still_threshold,...i.move_energy,...i.still_energy),o.push(...function(e,t){const n=[];for(const[i]of ye(e.entities,t)){if(!i.startsWith("sensor."))continue;const e=i.slice(i.indexOf(".")+1);($i(e)||bi(e))&&n.push(i)}return n}(e,t),...function(e,t){const n=[];for(const[i]of ye(e.entities,t)){if(!i.startsWith("sensor."))continue;const e=fi(i);(hi.test(e)||_i.test(e)||vi.test(e)||pi.test(e))&&n.push(i)}return n}(e,t)),!!o.some(t=>Ds(e,t))||!o.some(e=>void 0!==e)&&(n&&ye(e.entities,t).some(([t,n])=>"apollo_mmwave"!==n.platform&&Ds(e,t)))}function Os(e,t,n=!1){const i=e.devices[t];if(n&&!i)return;const o=Cs(e,t),s=Ie(e,t);if(!n&&!o&&!s)return;const r=Ps(e,t,!!o);if(!n&&!o&&!r)return;const a=je(e,t)??(null==o?void 0:o.profile),l=gi(e,t),d=!l&&wi(e,t),c=l||d,u=l||!c&&((null==o?void 0:o.ld2460)??!1),h=d||!c&&!u&&((null==o?void 0:o.ld2450)??!1);return n||a||h||u?{deviceId:t,base:s??t,name:(null==i?void 0:i.name_by_user)||(null==i?void 0:i.name)||s||t,profile:a,ld2450:h,ld2460:u,online:r}:void 0}function Fs(e,t){var n;if(t.device_id){const n=Os(e,t.device_id,!0);return n?[n]:[]}return(null===(n=t.devices)||void 0===n?void 0:n.length)?t.devices.map(t=>Os(e,t,!0)).filter(e=>void 0!==e):function(e){const t=[];for(const n of Object.keys(e.devices)){const i=Os(e,n);i&&t.push(i)}return t}(e)}function Ns(e,t,n={},i){if(0!==t.length)return{type:"entities",title:e,show_header_toggle:!1,...n,entities:Us(t,i)}}function Us(e,t){const n=[];let i=!1;for(const o of e)t&&o.slider?(i||(n.push({type:`custom:${Uo}`,device_id:t}),i=!0),n.push({type:`custom:${No}`,entity:o.entity,name:o.name,device_id:t})):n.push(Bs(o));return n}function js(e,t){return t.map(t=>{const n=e.states[t.entity];return t.slider&&void 0!==(null==n?void 0:n.attributes.mode)&&!as(n)?{entity:t.entity,name:t.name}:t})}function Bs(e){return e.confirm?{type:"button",entity:e.entity,name:e.name,action_name:e.confirm.action,tap_action:{action:"perform-action",perform_action:"button.press",target:{entity_id:e.entity},confirmation:{text:e.confirm.text}}}:{entity:e.entity,name:e.name}}function Hs(e,t){const n=function(e,t){const n=(i=e.name,i.replace(/[!-\/:-@\[-`{-~]/g,"\\$&"));var i;if(!e.profile&&!Is(e))return{type:"markdown",content:`**${n}**: no radar data available right now.\n\nThe device looks offline (or exposes no recognizable radar entities). Its cards will appear here once it reports in.\n\n`+Ws(e)};if(e.ld2460)return function(e,t,n){const i=t.installationMode?"check **Installation Mode** under LD2460 Live (side for a wall, top for a ceiling), ":"",o=e.profile;if(!o||!t.gateRadar)return{type:"markdown",content:`**${n}**, Apollo mmWave (LD2460 tracking radar).\n\nDraw occupancy zones over the live target positions below.\n\n**Start here**\n${Zs([...t.ld2450Setup?["Fix anything the Radar setup card flags."]:[],...t.installationMode?["Check **Installation Mode** under LD2460 Live: side for a wall, top for a ceiling."]:[],Ys,Qs,"Press **Add zone** under the zone map and drag on the map to draw the zone. Reload this page, then walk into the zone and watch it turn on under Zone presence."])}\n\n${Xs(t)}\n\n`+Ws(e)};const s=t.ld2450Setup?"fix anything Radar setup flags above the zone map, ":"",r=t.combinedPresence?qs:t.gatePresence?`**In automations**, use **${o.label} Presence** (Radar Target on this tab) for the whole room, or a zone's presence sensor for one part of it.`:Xs(t);return{type:"markdown",content:`**${n}**, Apollo mmWave with two radars. The **${o.label}** senses people anywhere in range, even sitting still. The **LD2460** tracks where up to 5 people are and drives the zone map.\n\n**Start here**\n`+Zs([...Vs(o,t,!0),`For the LD2460, ${i}${s}choose **Wall** or **Ceiling** under Map settings on the zone map (a radar that reports its mount sets this itself), set **Cone rotation** (**Map rotation** on a ceiling) to match how the sensor is mounted, then press **Add zone**, draw the zone and walk into it.`])+`\n\n${r}\n\n[Full tuning guide →](${o.wikiUrl}) · ${Ws(e)}`}}(e,t,n);if(!e.profile||e.ld2450&&!t.gateRadar)return{type:"markdown",content:`**${n}**, Apollo mmWave (LD2450 tracking radar).\n\nDraw occupancy zones over the live target positions below.\n\n**Start here**\n${Zs([...t.ld2450Setup?["Fix anything the Radar setup card flags."]:[],Ks,Qs,"Press **Add zone** under the zone map and drag on the map to draw the zone. Reload this page, then walk into the zone and watch it turn on under Zone presence."])}\n\n${Gs(t.combinedPresence)}\n\n`+Ws(e)};const o=e.profile,s=`[Full tuning guide →](${o.wikiUrl}) · ${Ws(e)}`;if(!e.ld2450)return{type:"markdown",content:`**${n}**, Apollo ${o.label} radar.\n\n**Start here**\n${Zs(Vs(o,t,!1))}\n\n`+(t.gatePresence?`${Js(t.anyZone)}\n\n`:"")+s};const r=t.ld2450Setup?"fix anything Radar setup flags above the zone map, ":"",a=t.combinedPresence?qs:t.gatePresence?`**In automations**, use **${o.label} Presence** (Radar Target on this tab) for the whole room, or a zone's presence sensor for one part of it.`:Gs(!1);return{type:"markdown",content:`**${n}**, Apollo mmWave with two radars. The **${o.label}** senses people anywhere in range, even sitting still. The **LD2450** tracks where people are and drives the zone map.\n\n**Start here**\n`+Zs([...Vs(o,t,!0),`For the LD2450, ${r}choose **Wall**, **High** or **Ceiling** under Map settings on the zone map, set **Cone rotation** (**Map rotation** on a ceiling) to match how the sensor is mounted, then press **Add zone**, draw the zone and walk into it.`])+`\n\n${a}\n\n`+s}}(e,t);return e.online||!e.profile&&!Is(e)||(n.content=`${n.content}\n\n**Offline right now.** Its entities are unavailable, so the cards below will fill in once it reconnects. If this radar was replaced or reflashed under a new name, delete the old device in Home Assistant to drop this tab.`),n}function Ws(e){return`[All settings for this device →](/config/devices/device/${encodeURIComponent(e.deviceId)})`}function Zs(e){return e.map((e,t)=>`${t+1}. ${e}`).join("\n")}function Gs(e){return`**In automations**, use a zone's presence sensor, or **${e?"Combined Presence":"LD2450 Presence"}** for anywhere the radar sees.`}var qs="**In automations**, use **Combined Presence** for the whole room (on while either radar sees someone), or a zone's presence sensor for one part of it.";function Js(e){return"**In automations**, use **Radar Target** for the whole room. If it turns off while someone sits still, raise **Radar Timeout** to 60 s or more."+(e?" To ignore people past End Zone 3, use **Any zone** instead.":"")}function Vs(e,t,n){const i=n?`the ${e.label}`:"it",o=n?`${e.label} presence`:"presence",s=n?`the ${e.label}'s Radar setup card`:"the Radar setup card";return[...t.gateSetup?[`Fix anything ${s} flags.`]:[],"Press **Calibrate with empty room** on the Auto-calibrate card and leave the room.",`Set how far ${i} should look: **${e.rangeLabels[0]} / ${e.rangeLabels[1]}** on the Detection Range card (each gate is ${t.gateDepth}).`,`Set how long ${o} stays on after you stop moving: **Radar Timeout**, same card.`,"Walk the room and watch the Gate Energy chart. Raise a gate's threshold if it triggers with nobody there, lower it if it misses you."]}function Xs(e){return e.combinedPresence?qs:e.ld2460Presence?"**In automations**, use a zone's presence sensor, or **LD2460 Presence** for anywhere the radar sees.":"**In automations**, use a zone's presence sensor. For the whole room, draw one zone over it."}var Ks="Under Map settings on the zone map, choose **Wall**, **High** (high on a wall or in a ceiling corner, tilted down) or **Ceiling** (straight down), and fill in the heights it asks for.",Ys="Under Map settings on the zone map, choose **Wall** or **Ceiling**. A radar that reports its mount sets this itself.",Qs="Set **Cone rotation** (**Map rotation** on a ceiling) under Map settings to match how the sensor is mounted.";function er(e){return{type:"markdown",content:e}}var tr="Apollo mmWave Dashboard",nr="Zone presence";var ir="Device";function or(e,t,n){const i=Je(e,t.deviceId),o=function(e,t){return e.profile&&t&&Is(e)?{name:"Restart device (both radars)",text:"Restart the whole device? Both radars stop, and the device is offline for a short while before it reconnects."}:Is(e)?{name:"Restart device (also restarts the radar)",text:"Restart the whole device? The radar restarts with it, and the device is offline for a short while before it reconnects."}:{name:"Restart device",text:"Restart the whole device? It is offline for a short while before it reconnects."}}(t,n),s=Ns(ir,bs(e,function(e,t){return[...ps(e.apollo_firmware,"Apollo firmware"),...ps(e.ld2410_firmware,"LD2410 firmware"),...ps(e.ld2412_firmware,"LD2412 firmware"),...ps(e.ld2450_firmware,"LD2450 firmware"),...ps(e.update,"Firmware update"),...fs(e.esp_reboot,t.name,t.text,"Restart")]}(i,o))),r=s?[s]:[];return Ge(e,i.rssi)&&r.push({type:"conditional",conditions:[{condition:"numeric_state",entity:i.rssi,below:-75}],card:{type:"markdown",content:"**Weak Wi-Fi.** The signal is below -75 dBm, so presence updates can lag or drop out. Move the device or your Wi-Fi router closer, or add an access point."}}),r.push({type:"markdown",...s?{}:{title:ir},content:`${Ws(t)}\n\n**Download a support file** for Apollo support: open [Apollo mmWave Dashboard](/config/integrations/integration/apollo_mmwave), then pick **Download diagnostics** from the three dots menu.`}),1===r.length?r[0]:{type:"vertical-stack",cards:r}}function sr(e,t){const n=uo(e,t).filter(t=>Ge(e,t));return 0===n.length?{type:"markdown",title:nr,content:"Press **Add zone** under the zone map to get a presence sensor for a zone. Reload this page to see it here."}:{type:"entities",title:nr,show_header_toggle:!1,state_color:!0,entities:n.map(e=>({type:"conditional",conditions:[{condition:"state",entity:e,state_not:"unavailable"}],row:{entity:e,state_color:!0}}))}}function rr(e,t){const n="LD2450 Live",i=Ns(n,bs(e,function(e){return[...ps(e.presence,"LD2450 Presence"),...ps(e.moving_target,"Moving Target"),...ps(e.still_target,"Still Target"),...e.targets.flatMap((e,t)=>[...ps(e.distance,`Target ${t+1} Distance`),...ps(e.direction,`Target ${t+1} Direction`)])]}(t)),{state_color:!0});if(!t.presence_target_count||!Ge(e,t.presence_target_count))return i;const o={type:"markdown",...i?{}:{title:n},content:ws(t.presence_target_count)};return i?{type:"vertical-stack",cards:[i,o]}:o}function ar(e,t){const n="LD2460 Live",i=Ns(n,bs(e,function(e){return[...ps(e.presence,"LD2460 Presence"),...ps(e.installation_mode,"Installation Mode"),...e.targets.flatMap((e,t)=>[...ps(e.distance,`Target ${t+1} Distance`),...ps(e.angle,`Target ${t+1} Angle`)])]}(t)),{state_color:!0}),o=i?[i]:[];return t.target_count&&Ge(e,t.target_count)&&o.push({type:"markdown",...o.length?{}:{title:n},content:ws(t.target_count)}),Ge(e,t.installation_mode)&&o.push(er("💡 **Installation Mode** is read from the radar when the device starts: side for a wall, top for a ceiling. If it is missing or unknown, choose **Wall** or **Ceiling** under Map settings on the zone map.")),o.length<=1?o[0]:{type:"vertical-stack",cards:o}}function lr(e,t,n,i){const o=function(e){var t;return"mi"===(null===(t=e.config)||void 0===t||null===(t=t.unit_system)||void 0===t?void 0:t.length)?"ft":"m"}(e);let s=.75,r=!1,a=!1,l=!1;const d={},c=!!t.profile&&Is(t),u=[];if(t.profile){const h=t.profile;d.calibrate={type:"custom:apollo-radar-calibrate-card",device_id:t.deviceId,device_base_name:t.base,title:"Auto-calibrate",...i?{calibration:i}:{}};const _=Be(e,t.deviceId)??h.entityMap(t.base),p=h.label;d.gateSetup=Ao(_,h).some(t=>Ge(e,t))?{type:"custom:apollo-radar-setup-card",device_id:t.deviceId,radar:"gate"}:void 0,s=function(e,t){var n;const i=ft(t.gate_size?null===(n=e.states[t.gate_size])||void 0===n?void 0:n.state:void 0);return void 0!==i&&i>0?i:.75}(e,_),r=Ge(e,_.radar_target),a=Ge(e,_.zone_occupancy),l=!!d.gateSetup||r;const v=e=>function(e,t,n){return 0===e?"G0 (at the sensor)":`G${e} (${$s(e*t,n)})`}(e,s,o);u.push(...function(e,t){return[...ps(e.radar_target,t?`${t} Presence`:"Detected"),...ps(e.moving_target,t?`${t} Moving`:"Moving"),...ps(e.still_target,t?`${t} Still`:"Still"),...ps(e.zone_occupancy,"Any zone"),...ps(e.zone_1_occupancy,"Zone 1"),...ps(e.zone_2_occupancy,"Zone 2"),...ps(e.zone_3_occupancy,"Zone 3")]}(_,c?p:void 0));const f=Ns(`${p} Detection Range`,js(e,bs(e,function(e,t,n){return[...ps(e.radar_timeout,"Radar Timeout"),...ps(e.gate_size,n),...vs(e.max_move_distance,t[0]),...vs(e.max_still_distance,t[1])]}(_,h.rangeLabels,h.gateSizeLabel))),{},t.deviceId),g=Ns(`${p} Move Thresholds`,js(e,bs(e,function(e,t=e=>`G${e}`){const n=[];for(let i=0;i<e.move_threshold.length;i++)n.push(...vs(e.move_threshold[i],t(i)));return n}(_,v))),{},t.deviceId),m=Ns(`${p} Still Thresholds`,js(e,bs(e,function(e,t=e=>`G${e}`){const n=[];for(let i=0;i<e.still_threshold.length;i++)n.push(...vs(e.still_threshold[i],t(i)));return n}(_,v))),{},t.deviceId);d.controls=Ns(`${p} Controls`,bs(e,function(e,t){return[...ps(e.engineering_mode,"Radar Engineering Mode"),...ps(e.background_correction,"Start Dynamic Background Correction"),...ps(e.background_correction_status,"Background Correction Running"),...ps(e.bluetooth,ys),...ms(e.restart_radar,t),...gs(e.factory_reset_radar,t)]}(_,p))),d.range=f,d.rangeNote=f?er(h.rangeTip($s(s,o))):void 0,d.zone=Ns(`${p} Zone Config`,bs(e,function(e){return[...ps(e.zone_1_start,"Start Zone 1"),...ps(e.end_zone_1,"End Zone 1"),...ps(e.end_zone_2,"End Zone 2"),...ps(e.end_zone_3,"End Zone 3")]}(_))),d.zoneNote=d.zone?er(function(e,t){return`💡 The boxes are in cm${"ft"===e?" (100 cm is about 3.3 ft)":""}. The zones sit back to back: Zone 1 runs from Start Zone 1 to End Zone 1, Zone 2 from there to End Zone 2, and Zone 3 from there to End Zone 3.`+(t?" **Any zone** is on while someone is in any of the three zones, so it ignores people past End Zone 3.":"")+" For the whole room, use **Radar Target** in automations: the zone sensors also need the radar's distance, which can read unknown while someone is there."}(o,a)):void 0,d.distance={type:"custom:apollo-radar-distance-card",device_id:t.deviceId,device_base_name:t.base,title:`${p} Distances`,...n?{distance_unit:n}:{}},d.gateEnergy={type:"custom:apollo-radar-gate-energy-card",device_id:t.deviceId,device_base_name:t.base,title:`${p} Gate Energy`},d.moveThr=g,d.stillThr=m,d.gateNote=g||m?er(h.gateTip):void 0,d.occupancy=Ns(`${p} Target / Occupancy`,bs(e,function(e){return[...ps(e.radar_target,"Radar Target"),...ps(e.moving_target,"Radar Moving Target"),...ps(e.still_target,"Radar Still Target"),...ps(e.zone_1_occupancy,"Radar Zone 1 Occupancy"),...ps(e.zone_2_occupancy,"Radar Zone 2 Occupancy"),...ps(e.zone_3_occupancy,"Radar Zone 3 Occupancy"),...ps(e.zone_occupancy,"Any zone")]}(_)),{state_color:!0})}if(t.ld2450){d.zoneHeader=t.profile?{type:"heading",heading:"Zone Map"}:void 0;const n=ro(e,t.deviceId);d.ld2450Setup=Ge(e,n.zone_type)||Ge(e,n.multi_target_tracking)?{type:"custom:apollo-radar-setup-card",device_id:t.deviceId}:void 0,d.zoneMap=xi(t.deviceId,t.name),d.zonePresence=sr(e,t.deviceId),d.ld2450Live=rr(e,n),d.ld2450Controls=Ns("LD2450 Controls",bs(e,function(e){return[...ps(e.zone_type,"Zone Type"),...ps(e.multi_target_tracking,"Multi Target Tracking"),...ps(e.timeout,"Radar Timeout"),...ps(e.bluetooth,ys),...ms(e.restart,"LD2450"),...gs(e.factory_reset,"LD2450")]}(n))),d.ld2450ControlsNote=Ge(e,n.timeout)?er("💡 **Radar Timeout** is how long LD2450 Presence stays on after the radar last sees someone. It does not hold the zones you draw: a zone turns off as soon as nobody is in it, unless you give it a **Hold** time under Zones on the zone map."):void 0,d.builtInZones=function(e,t){if(!Ge(e,t.zone_type))return;const n=[],i=[];for(let s=0;s<3;s++){const o=`Zone ${s+1}`,r=bs(e,Ss(t,s)),a=zs(t,s).map(t=>Ge(e,t)?t:void 0);a.some(Boolean)&&i.push({label:o,ids:a}),0!==r.length&&n.push({type:"section",label:o},...r.map(e=>({entity:e.entity,name:e.name})))}if(0===n.length&&0===i.length)return;const o=[{type:"markdown",title:"Radar's built-in zones",content:"These are the radar chip's own zones, not the ones on the zone map. Zone Type Disabled is recommended, because the zone map replaces them."}];return n.length&&o.push({type:"entities",show_header_toggle:!1,entities:n}),i.length&&o.push({type:"markdown",content:Rs(i)}),o.push({type:"markdown",content:"The radar's built-in zones use its own uncorrected coordinates, so on a High or Ceiling mount they do not line up with this map. Draw zones here instead."}),{type:"conditional",conditions:[{condition:"state",entity:t.zone_type,state_not:["Disabled","unavailable","unknown"]}],card:{type:"vertical-stack",cards:o}}}(e,n),u.push(...function(e,t){return[...ps(e.presence,"LD2450 Presence"),...t.map(e=>({entity:e}))]}(n,uo(e,t.deviceId)))}let h;return t.ld2460&&(d.zoneHeader=t.profile?{type:"heading",heading:"Zone Map"}:void 0,h=bo(e,t.deviceId),d.ld2450Setup=Ge(e,h.installation_mode)||Ge(e,h.target_count)?{type:"custom:apollo-radar-setup-card",device_id:t.deviceId,radar:"ld2460"}:void 0,d.zoneMap=xi(t.deviceId,t.name),d.zonePresence=sr(e,t.deviceId),d.ld2460Live=ar(e,h),u.push(...function(e,t){return[...ps(e.presence,"LD2460 Presence"),...t.map(e=>({entity:e}))]}(h,uo(e,t.deviceId)))),d.history=function(e,t){if(0!==t.length)return{type:"history-graph",title:e,hours_to_show:24,entities:t}}(t.profile&&!Is(t)?`${t.profile.label} Occupancy History`:"Occupancy History",bs(e,u)),d.help=Hs(t,{gateDepth:$s(s,o),gateSetup:!!d.gateSetup,ld2450Setup:!!d.ld2450Setup,installationMode:Ge(e,null==h?void 0:h.installation_mode),ld2460Presence:Ge(e,null==h?void 0:h.presence),gatePresence:r,anyZone:a,gateRadar:l,combinedPresence:Ge(e,Je(e,t.deviceId).combined_presence)}),d.device=or(e,t,l),d}function dr(e){return e?{...e,grid_options:{columns:"full"}}:void 0}function cr(e,t,n,i){const o=lr(e,t,n,i);let s;const r=[];o.zoneMap&&(t.profile?(s=[o.zoneHeader,dr(o.ld2450Setup),dr(o.zoneMap)],r.push(s,[o.zonePresence,o.ld2450Live,o.ld2460Live,o.ld2450Controls,o.ld2450ControlsNote,o.builtInZones])):(s=[o.ld2450Setup?o.help:dr(o.help),o.ld2450Setup,dr(o.zoneMap)],r.push(s,[o.zonePresence,o.ld2450Live,o.ld2460Live,o.history],[o.ld2450Controls,o.ld2450ControlsNote,o.builtInZones])));const a=[];if(t.profile){const e=[o.help,o.gateSetup,o.calibrate,o.controls,o.zone,o.zoneNote],t=[o.distance,o.range,o.rangeNote];(o.zone?t:e).push(o.occupancy),a.push(e,...r,t,[o.gateEnergy,o.moveThr,o.gateNote],[o.history,o.stillThr])}else o.zoneMap?a.push(...r):a.push([o.help]);const l=a.map(e=>({cards:e.filter(Boolean),wide:e===s})).filter(e=>e.cards.length>0);return l[l.length-1].cards.push(o.device),l.map(({cards:e,wide:t})=>({type:"grid",...t?{column_span:2}:{},cards:e}))}function ur(e,t){const n=/* @__PURE__ */new Set;return Fs(e,t).map(i=>{let o=i.base;return n.has(o)&&(o=`${i.base}_${i.deviceId}`),n.add(o),function(e,t,n,i=t.base,o){const s=cr(e,t,n,o);return{title:t.name,path:i,type:"sections",...s.some(e=>e.column_span)?{dense_section_placement:!0}:{},sections:s}}(e,i,t.distance_unit,o,t.calibration)})}function hr(e,t){return Fs(e,t).flatMap(n=>cr(e,n,t.distance_unit,t.calibration))}function _r(e,t){return Fs(e,t).flatMap(n=>function(e,t,n,i){const o=lr(e,t,n,i);return[o.help,o.gateSetup,o.calibrate,o.controls,o.range,o.rangeNote,o.zone,o.zoneNote,o.distance,o.gateEnergy,o.moveThr,o.stillThr,o.gateNote,o.occupancy,o.zoneHeader,o.ld2450Setup,o.zoneMap,o.zonePresence,o.ld2450Live,o.ld2460Live,o.history,o.ld2450Controls,o.ld2450ControlsNote,o.builtInZones,o.device].filter(Boolean)}(e,n,t.distance_unit,t.calibration))}function pr(e,t){return Fs(e,t).map(e=>{var t;return JSON.stringify([e.deviceId,(null===(t=e.profile)||void 0===t?void 0:t.key)??"",e.ld2450,e.ld2460,e.name,e.base])}).sort().join(",")}function vr(e,t,n){if(t.devices===n.devices&&t.entities===n.entities&&!function(e,t){for(const n in t.states){const i=t.states[n],o=e.states[n];if(o!==i&&Ls(o)!==Ls(i))return!0}return!1}(t,n))return!1;const i=function(e){const t=e.options;return 2===Object.keys(e).length&&"object"==typeof t&&null!==t}(e)?{...e,...e.options}:e;return pr(t,i)!==pr(n,i)}var fr={title:tr,cards:[{type:"markdown",content:"No Apollo mmWave devices found. Make sure your MSR-1/MSR-2 (LD2410), R PRO-1 (LD2412 + LD2450), or MTR-1 (LD2450) is added to Home Assistant."}]},gr={title:tr,cards:[{type:"markdown",content:"The dashboard's device selection points at devices that no longer exist in Home Assistant. Open Settings > Devices & Services > Apollo mmWave Dashboard > Configure and clear or update Dashboard devices (leave it empty to show every Apollo mmWave device automatically)."}]},mr=class extends HTMLElement{static async generate(e,t){return{type:"sections",sections:hr(t,e)}}};mr.shouldRegenerate=vr;var yr=class extends HTMLElement{static async generate(e,t){var n;const i=ur(t,e),o=(null===(n=e.devices)||void 0===n?void 0:n.length)||e.device_id?gr:fr;return{title:tr,views:i.length?i:[o]}}};yr.shouldRegenerate=vr;var $r=class extends HTMLElement{static async generate(e,t){return{type:"grid",cards:_r(t,e)}}};$r.shouldRegenerate=vr,lt("ll-strategy-view-apollo-radar-tuning",mr),lt("ll-strategy-section-apollo-radar-tuning",$r),lt("ll-strategy-dashboard-apollo-radar-tuning",yr),window.customStrategies=window.customStrategies||[],window.customStrategies.some(e=>"apollo-radar-tuning"===e.type)||window.customStrategies.push({type:"apollo-radar-tuning",strategyType:"dashboard",name:tr,description:"Auto-built tuning dashboard for Apollo radar devices (MSR / LD2410, R PRO / LD2412 + LD2450, MTR-1 / LD2450).",documentationURL:"https://github.com/ApolloAutomation/apollo-mmwave-main"}),console.info(`%c APOLLO-MMWAVE %c v${t} `,"color:#fff;background:#03a9f4;font-weight:700;","color:#03a9f4;background:#fff;font-weight:700;");export{t as CARD_VERSION};