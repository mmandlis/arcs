
// @license
// Copyright (c) 2018 Google Inc. All rights reserved.
// This code may only be used under the BSD style license found at
// http://polymer.github.io/LICENSE.txt
// Code distributed by Google as part of this project is also
// subject to an additional IP rights grant found at
// http://polymer.github.io/PATENTS.txt

'use strict';

const eventsService = 'https://app.ticketmaster.com/discovery/v2/events?apikey=6g6GruAsAGU9RyT3lfjUFYtLSnvUITDe&radius=1000';
const geohashCharMap = '0123456789bcdefghjkmnpqrstuvwxyz';

// TODO: Unify this with FindShows.js
defineParticle(({DomParticle, html, log, _fetch}) => {
  const host = `[find-shows]`;
  const styles = html`
  <style>
    ${host} {
      padding: 0 24px 24px;
      overflow: auto;
    }
    ${host} [logo] {
      font-weight: bold;
      font-style: italic;
    }
    ${host} [list] {
      margin: 0 -8px;
    }
    ${host} [buttons] {
      display: flex;
      padding-top: 8px;
    }
    ${host} [button] {
      transition: all 0.3s ease-in-out;
      border-radius: 24px;
      border: 1px solid rgba(0,0,0,.1);
      font-size: 14px;
      font-weight: bold;
      line-height: 40px;
      text-align: center;
      color: #444;
      background: #eee;
      margin-right: 16px;
    }
    ${host} [button] > div {
      border-radius: 20px;
      padding: 0 20px;
      background-color: #fefefe;
    }
    ${host} [glowing] {
      -webkit-animation-name: glowing;
      -webkit-animation-duration: 1.8s;
      -webkit-animation-timing-function: ease-in-out;
      -webkit-animation-iteration-count: 2;
    }
    ${host} [glowing]:hover {
      background: rgba(3,169,244,.3);
      box-shadow: 0 0 20px rgba(3, 169, 244, .3);
    }
    @-webkit-keyframes glowing {
      0% {
        background: rgba(3,169,244,0);
        box-shadow: 0 0 20px rgba(3, 169, 244, 0);
      }
      25% {
        background: rgba(3,169,244,0.2);
        box-shadow: 0 0 20px rgba(3, 169, 244, 0.2);
      }
      50% {
        background: rgba(3,169,244,.3);
        box-shadow: 0 0 20px rgba(3, 169, 244, .3);
      }
      75% {
        background: rgba(3,169,244,0.2);
        box-shadow: 0 0 20px rgba(3, 169, 244, 0.2);
      }
      100% {
        background: rgba(3,169,244,0);
        box-shadow: 0 0 20px rgba(3, 169, 244, 0);
      }
    }
  </style>
  `;

  const template = html`
<div find-shows>
${styles}
  <div logo>Ticketmaster</div>
  <div list slotid="listing"></div>
  <div buttons>
    <div button on-click="moreShows"><div>More shows like this</div></div>
    <div button><div glowing>Buy tickets</div></div>
  </div>
</div>
  `;
  return class extends DomParticle {
    constructor() {
      super();
      // We need to mark the particle as busy ASAP to get an opportunity to fetch concert data.
      // It should be enough to do this around the fetch() call, but at that point it is too late.
      // Let's track this in https://github.com/PolymerLabs/arcs/issues/1958.
      this.startBusy();
    }

    get template() {
      return template;
    }

    shouldRender(props) {
      return Boolean(props.artists && props.location);
    }

    async willReceiveProps(props, state) {
      if (state.fetching || !props.artists || !props.location) return;
      this._setState({fetching: true});

      // Note that it won't be possible to make those kind of fetches in production.
      // We need privacy preserving, non-logging data sources to allow speculatively fetching data.
      const geohash = this._encodeGeohash(props.location.latitude, props.location.longitude);
      const artists = props.artists.slice();

      artists.sort((a, b) => a.score < b.score ? 1 : (a.score > b.score ? -1 : 0));

      await this.clearHandle('shows');
      for (const artist of artists) {
        try {
          const response = await _fetch(`${eventsService}&keyword=${encodeURI(artist.name)}&geoPoint=${geohash}`);
          const json = await response.json();
          if (this._processResponse(json, artist.name)) {
            break;
          }
        } catch (e) {
          // comment here because lint
        }
      }
      this.doneBusy();
    }

    async _processResponse(response, artist) {
      if (response.page.totalElements === 0) {
        return false;
      }

      let nearest = null;
      for (const event of response._embedded.events) {
        if (!nearest || nearest.distance > event.distance) nearest = event;
      }

      this.setParticleDescription(`Ticketmaster: Get ticket for ${artist} concert on ${nearest.dates.start.localDate}`);

      this.appendRawDataToHandle('shows', [{
        name: nearest.name,
        venue: nearest._embedded.venues[0].name,
        date: nearest.dates.start.localDate,
        time: nearest.dates.start.localTime,
        imageUrl: this._pickImageUrl(nearest.images)
      }]);

      this._setState({fetched: true});
      return true;
    }

    async moreShows() {
      // TODO: Store remaining events from the response and display them here.
    }

    _pickImageUrl(images) {
      let best = null;
      for (const image of images) {
        if (image.ratio === '3_2' && (!best || best.width > image.width)) {
          best = image;
        }
      }
      return best ? best.url : '';
    }

    // Encoding of (latitude, longitude) into a geohash.
    // The algorithm bisects latitude and longitude alternately,
    // which produces a stream of bits - one per bisection.
    // Every sequence of 5 bits is stored in a alphanumeric character
    // until a requested precision is achieved.
    _encodeGeohash(lat, lon, precision = 8) {
      let latMin = -90;
      let latMax = 90;
      let lonMin = -180;
      let lonMax = 180;

      let geohash = '';
      let bit = 0;
      let idx = 0;

      do {
        if (bit && bit % 5 === 0) {
          geohash += geohashCharMap.charAt(idx);
          if (geohash.length === precision) return geohash;
          idx = 0;
        }
        idx *= 2;
        if (bit % 2 === 0) {
          const lonMid = (lonMin + lonMax) / 2;
          if (lon >= lonMid) {
            lonMin = lonMid;
            idx++;
          } else {
            lonMax = lonMid;
          }
        } else {
          const latMid = (latMin + latMax) / 2;
          if (lat >= latMid) {
            latMin = latMid;
            idx++;
          } else {
            latMax = latMid;
          }
        }
      } while (++bit);
    }
  };
});
