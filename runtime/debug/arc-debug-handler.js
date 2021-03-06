/**
 * @license
 * Copyright (c) 2018 Google Inc. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * Code distributed by Google as part of this project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import {enableTracingAdapter} from './tracing-adapter.js';
import {ArcPlannerInvoker} from './arc-planner-invoker.js';
import {ArcStoresFetcher} from './arc-stores-fetcher.js';
import {DevtoolsConnection} from './devtools-connection.js';

// Arc-independent handlers for devtools logic.
DevtoolsConnection.onceConnected.then(devtoolsChannel => {
  enableTracingAdapter(devtoolsChannel);
});

export class ArcDebugHandler {
  constructor(arc, devtoolsChannel) {

    // Message handles go here.
    if (!arc.isSpeculative) {
      new ArcPlannerInvoker(arc, devtoolsChannel);
      new ArcStoresFetcher(arc, devtoolsChannel);
    }

    // TODO: Disconnect when arc is disposed?

    devtoolsChannel.send({
      messageType: 'arc-available',
      messageBody: {
        id: arc.id.toString(),
        isSpeculative: arc.isSpeculative
      }
    });
  }
}
