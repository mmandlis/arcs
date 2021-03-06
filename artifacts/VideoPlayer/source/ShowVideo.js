/**
 * @license
 * Copyright (c) 2017 Google Inc. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * Code distributed by Google as part of this project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

'use strict';

defineParticle(({DomParticle}) => {

  const template = `
<span>{{mode}}</span> position <span>{{position}}</span> at <span>{{ts}}</span>
<video muted autoplay id='video' width='100%' preload='none' poster="https://media.w3.org/2010/05/sintel/poster.png">
  <source id='mp4' src="https://media.w3.org/2010/05/sintel/trailer.mp4" type='video/mp4'>
</video>
<video-controller config={{config}} video="video"></video-controller>
  `.trim();

  return class extends DomParticle {
    get template() {
      return template;
    }
    render(props, state) {
      if (props.controls && props.controls.length) {
        const c = props.controls[props.controls.length - 1];
        return {
          mode: c.mode,
          position: c.position,
          ts: c.ts,
          volume: c.volume,
          config: {
            mode: c.mode,
            position: c.position,
            ts: c.ts,
            volume: c.volume,
          }};
      }
    }
  };
});