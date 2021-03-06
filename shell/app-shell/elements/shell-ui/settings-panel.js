import Const from '../../../lib/constants.js';
import Xen from '../../../components/xen/xen.js';
import IconStyle from '../../../components/icons.css.js';
import {arcToRecipe} from './generalizer.js';
import Firebase from '../../../lib/firebase.js';

const html = Xen.Template.html;
const template = html`

<style>
  ${IconStyle}
  :host {
    display: block;
    box-sizing: border-box;
    user-select: none;
  }
  section {
    display: block;
    box-sizing: border-box;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding: 0 16px;
    cursor: pointer;
  }
  section[bar] {
    height: 56px;
    display: flex;
    align-items: center;
  }
  section[bar][disabled] {
    opacity: 0.4;
    pointer-events: none;
  }
  section span {
    flex: 1
  }
  section[friends] {
    padding: 16px;
    cursor: default;
  }
  avatar {
    display: inline-block;
    height: var(--avatar-size);
    width: var(--avatar-size);
    min-width: var(--avatar-size);
    border-radius: 100%;
    border: 1px solid whitesmoke;
    background: gray center no-repeat;
    background-size: cover;
  }
  user-item {
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 8px 0;
  }
  user-item avatar {
    height: var(--large-avatar-size);
    width: var(--large-avatar-size);
    min-width: var(--large-avatar-size);
    margin-right: 16px;
  }
  user-item a {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: inherit;
  }
  [user] {
    max-height: 0;
    overflow: hidden;
    transition: max-height 300ms ease-in-out;
  }
  [user][open] {
    max-height: initial;
  }
</style>

<section user open$="{{user_picker_open}}">
  <user-picker users="{{users}}" friends="{{friends}}" avatars="{{avatars}}" on-selected="_onSelectUser"></user-picker>
</section>
<section bar disabled>
  <span>Star this arc</span>
  <icon>star_border</icon>
</section>
<section bar disabled on-click="_onCastClick">
  <span>Cast this arc</span>
  <icon>cast</icon>
</section>
<section bar disabled$="{{nopersist}}" on-click="_onProfileClick" style="{{profileStyle}}">
  <span>Use for suggestions</span>
  <icon>{{profileIcon}}</icon>
</section>
<section bar disabled$="{{nopersist}}" on-click="_onShareClick" style="{{shareStyle}}">
  <span>Use for friends' suggestions</span>
  <icon>{{shareIcon}}</icon>
</section>
<section bar on-click="_onPlungePipes">
  <span>Plunge the pipes</span>
  <icon>build</icon>
</section>
<section bar on-click="_onExperimentClick">
  <span>Convert Arc to Recipe</span>
  <icon>transform</icon>
</section>
<section friends>
  <span>Friends</span><br>
  <div style="padding-top: 8px;">{{friendsList}}</div>
</section>
`;

const userTemplate = html`
  <user-item on-click="_onSelect" key="{{key}}">
    <a href="{{href}}" target="_blank"><avatar xen:style="{{style}}"></avatar> <name>{{name}}</name></a>
  </user-item>
`;

const log = Xen.logFactory('SettingsPanel', '#bb4d00');

class SettingsPanel extends Xen.Debug(Xen.Base, log) {
  static get observedAttributes() {
    return ['key', 'arc', 'users', 'user', 'friends', 'avatars', 'share', 'user_picker_open'];
  }
  get template() {
    return template;
  }
  _willReceiveProps({share}, state, oldProps) {
    if (oldProps.share !== share) {
      this._setState(this._shareStateToFlags(share));
    }
  }
  _render(props, state) {
    const {user, friends, key, arc} = props;
    const {isProfile, isShared} = state;
    const render = {
      name: user && user.name,
      profileIcon: isProfile ? 'check' : 'check_box_outline_blank',
      profileStyle: isProfile ? 'color: #1A73E8' : '',
      shareIcon: isShared ? 'check' : 'check_box_outline_blank',
      shareStyle: isShared ? 'color: #1A73E8' : '',
      nopersist: Boolean(Const.SHELLKEYS[key])
    };
    if (arc && friends) {
      const resolver = url => arc._loader._resolve(url);
      render.friendsList = this._renderFriends(friends, resolver);
    }
    return [props, render];
  }
  _renderFriends(friends, resolver) {
    return {
      template: userTemplate,
      models: Object.values(friends).map(friend => ({
        key: friend.id,
        name: friend.name || '',
        style: `background-image: url("${resolver(friend.avatar)}");`,
        href: (() => {
          const url = new URL(document.location.href);
          url.searchParams.set('user', friend.id);
          return url.href;
        })()
      }))
    };
  }
  _onSelectUser(e, user) {
    this._fire('user', user);
  }
  _onCastClick() {
    this._fire('cast');
  }
  _onToolsClick() {
    this._fire('tools');
  }
  _onProfileClick() {
    let {isProfile, isShared} = this._state;
    isProfile = !isProfile;
    isShared = isProfile ? isShared : false;
    this._changeSharing(isProfile, isShared);
  }
  _onShareClick() {
    let {isProfile, isShared} = this._state;
    isShared = !isShared;
    isProfile = isShared ? true : isProfile;
    this._changeSharing(isProfile, isShared);
  }
  _changeSharing(isProfile, isShared) {
    const share = this._shareFlagsToShareState(isProfile, isShared);
    this._setState({isProfile, isShared, share});
    this._fire('share', share);
  }
  _shareStateToFlags(share) {
    return {
      isProfile: (share == Const.SHARE.friends) || (share === Const.SHARE.self),
      isShared: (share == Const.SHARE.friends)
    };
  }
  _shareFlagsToShareState(isProfile, isShared) {
    return isShared ? Const.SHARE.friends : isProfile ? Const.SHARE.self : Const.SHARE.private;
  }
  async _onExperimentClick() {
    const {arc} = this._props;
    if (arc) {
      arcToRecipe(await arc.serialize());
    }
  }
  _onPlungePipes() {
    const {user} = this._props;
    if (user && user.id) {
      log(`arcs/${user.id}-pipes`);
      Firebase.db.child(`arcs/${user.id}-pipes`).set(null);
      window.location.reload();
    }
  }
}
customElements.define('settings-panel', SettingsPanel);
