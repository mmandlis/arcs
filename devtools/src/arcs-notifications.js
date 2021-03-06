import {PolymerElement} from '../deps/@polymer/polymer/polymer-element.js';
import {MessengerMixin} from './arcs-shared.js';
import {html} from '../deps/@polymer/polymer/lib/utils/html-tag.js';

class ArcsNotifications extends MessengerMixin(PolymerElement) {
  static get template() {
    return html`
    <style include="shared-styles">
      :host {
        display: inline-block;
      }
      #warningsSection {
        display: inline-block;
        margin-right: 4px;
        position: relative;
      }
      .warning-icon {
        vertical-align: unset;
        background-position: -60px 10px;
        margin-right: 4px;
      }
      #warningsDetails {
        position: absolute;
        right: 0;
        top: 14px;
        line-height: initial;
        width: 300px;
        border: 1px solid var(--mid-gray);
        background: #fffae0;;
        z-index: 1;
        border-radius: 8px;
        box-shadow: 2px 2px 2px rgba(0,0,0,.2);
      }
      #warningsDetails > div {
        padding: 8px 10px;
      }
      #warningsDetails > div:not(:last-child) {
        border-bottom: 1px solid var(--mid-gray);
      }
    </style>
    <span id="warningsSection">
      <span class="devtools-icon-color warning-icon"></span><!-- avoid whitespace
   --><span id="warningsCount"></span>
      <div id="warningsDetails" style="display: none"></div>
    </span>
`;
  }

  static get is() { return 'arcs-notifications'; }

  static get properties() {
    return {
      warningsCount: {
        type: Number,
        value: 0,
        observer: '_updateWarningCount'
      }
    };
  }

  ready() {
    super.ready();
    window.addEventListener('click', e => {
      if (this.$.warningsDetails.style.display == 'none'
          && e.path.includes(this.$.warningsSection)) {
        this.$.warningsDetails.style.display = 'block';
      } else if (this.$.warningsDetails.style.display == 'block'
          && !e.path.includes(this.$.warningsDetails)) {
        this.$.warningsDetails.style.display = 'none';
      }
    });
  }

  onMessageBundle(messages) {
    for (const msg of messages) {
      switch (msg.messageType) {
        case 'Warning':
          switch (msg.messageBody) {
            case 'PreExistingArcs':
              this._addWarning(`Arcs Explorer has been opened after arc
                creation, some <b>information may be missing</b>. Reload the page
                to ensure all information is available.`);
              break;
          }
          break;
        case 'page-refresh':
          this._clear();
          break;
      }
    }
  }

  _addWarning(message) {
    const el = document.createElement('div');
    el.innerHTML = message;
    this.$.warningsDetails.appendChild(el);
    this.warningsCount++;
  }

  _clear() {
    this.warningsCount = 0;
    this.$.warningsDetails.innerHTML = '';
    this.$.warningsDetails.style.display = 'none';
  }

  _updateWarningCount(warningsCount) {
    this.$.warningsCount.innerText = warningsCount;
    this.$.warningsSection.style.display = warningsCount ? null : 'none';
  }
}

window.customElements.define(ArcsNotifications.is, ArcsNotifications);
