// Copyright (c) 2017 Google Inc. All rights reserved.
// This code may only be used under the BSD style license found at
// http://polymer.github.io/LICENSE.txt
// Code distributed by Google as part of this project is also
// subject to an additional IP rights grant found at
// http://polymer.github.io/PATENTS.txt

import {assert} from '../../../platform/assert-web.js';
import {compareStrings, compareComparables} from './util.js';
import {Recipe} from './recipe.js';
import {Particle} from './particle.js';
import {SlotSpec} from '../particle-spec.js';
import {Slot} from './slot.js';

export class SlotConnection {
  private readonly _recipe: Recipe;
  private readonly _particle: Particle;
  private readonly _name: string;
  private _slotSpec: SlotSpec | undefined = undefined;
  private _targetSlot: Slot | undefined = undefined;
  private _providedSlots: {[index: string]: Slot} = {};
  private _tags = <string[]>[];
  constructor(name, particle) {
    assert(particle);
    assert(particle.recipe);
    assert(name);

    this._recipe = particle.recipe;
    this._particle = particle;
    this._name = name;
  }

  remove() {
    this._particle.removeSlotConnection(this);
  }

  get recipe() { return this._recipe; }
  get particle() { return this._particle; }
  get name() { return this._name; }
  getQualifiedName() { return `${this.particle.name}::${this.name}`; }
  get slotSpec() { return this._slotSpec; }
  get targetSlot() { return this._targetSlot; }
  get providedSlots() { return this._providedSlots; }
  get tags() { return this._tags; }
  set tags(tags) { this._tags = tags; }

  set slotSpec(slotSpec) {
    assert(this.name === slotSpec.name);
    this._slotSpec = slotSpec;
    slotSpec.providedSlots.forEach(providedSlot => {
      let slot = this.providedSlots[providedSlot.name];
      if (slot == undefined) {
        slot = this.recipe.newSlot(providedSlot.name);
        slot._sourceConnection = this;
        slot._name = providedSlot.name;
        this.providedSlots[providedSlot.name] = slot;
      }
      assert(slot.handleConnections.length === 0, 'Handle connections must be empty');
      providedSlot.handles.forEach(handle => slot.handleConnections.push(this.particle.connections[handle]));
      assert(slot._name === providedSlot.name);
      assert(!slot.formFactor);
      slot.formFactor = providedSlot.formFactor;
    });
  }

  connectToSlot(targetSlot) {
    assert(targetSlot);
    assert(!this.targetSlot);
    assert(this.recipe === targetSlot.recipe, 'Cannot connect to slot from different recipe');

    this._targetSlot = targetSlot;
    targetSlot.consumeConnections.push(this);
  }

  disconnectFromSlot() {
    if (this._targetSlot) {
      this._targetSlot.removeConsumeConnection(this);
      this._targetSlot = undefined;
    }
  }
  
  _clone(particle, cloneMap) {
    if (cloneMap.has(this)) {
      return cloneMap.get(this);
    }

    const slotConnection = particle.addSlotConnection(this.name);
    slotConnection.tags = this.tags;
    if (this.slotSpec) {
      slotConnection._slotSpec = particle.spec.getSlotSpec(this.name);
    }

    cloneMap.set(this, slotConnection);
    return slotConnection;
  }

  _normalize() {
    const normalizedSlots = {};
    for (const key of (Object.keys(this._providedSlots).sort())) {
      normalizedSlots[key] = this._providedSlots[key];
    }
    this._providedSlots = normalizedSlots;
    Object.freeze(this);
  }

  _compareTo(other) {
    let cmp;
    if ((cmp = compareStrings(this.name, other.name)) !== 0) return cmp;
    if ((cmp = compareComparables(this._targetSlot, other._targetSlot)) !== 0) return cmp;
    if ((cmp = compareComparables(this._particle, other._particle)) !== 0) return cmp;
    return 0;
  }

  _isValid(options) {
    if (this._targetSlot && this._targetSlot.sourceConnection &&
        this._targetSlot !== this._targetSlot.sourceConnection.providedSlots[this._targetSlot.name]) {
      if (options && options.errors) {
        options.errors.set(this, `Invalid target slot '${this._targetSlot.name}' for slot connection '${this.name}' of particle ${this.particle.name}`);
      }
      return false;
    }

    // TODO: add more checks.
    return true;
  }

  isResolved(options) {
    assert(Object.isFrozen(this));

    if (!this.name) {
      if (options) {
        options.details = 'missing name';
      }
      return false;
    }
    if (!this.particle) {
      if (options) {
        options.details = 'missing particle';
      }
      return false;
    }

    if (this.slotSpec.isRequired) {
      if (!this.targetSlot || !(this.targetSlot.id || this.targetSlot.sourceConnection.isConnected())) {
        // The required connection has no target slot
        // or its target slot it not resolved (has no ID or source connection).
        if (options) {
          options.details = 'missing target-slot';
        }
        return false;
      }
    }
    if (!this.targetSlot) {
      return true;
    }

    return this.slotSpec.providedSlots.every(providedSlot => {
      if (providedSlot.isRequired && this.providedSlots[providedSlot.name].consumeConnections.length === 0) {
        if (options) {
          options.details = 'missing consuming slot';
        }
        return false;
      }
      return true;
    });
  }

  isConnectedToInternalSlot() {
    return this.targetSlot && (!!this.targetSlot.sourceConnection);
  }
  isConnectedToRemoteSlot() {
    return this.targetSlot && (!!this.targetSlot.id);
  }
  isConnected() {
    return this.isConnectedToInternalSlot() || this.isConnectedToRemoteSlot();
  }

  toString(nameMap, options) {
    const consumeRes = [];
    consumeRes.push('consume');
    consumeRes.push(`${this.name}`);
    if (this.targetSlot) {
      consumeRes.push(`as ${
          (nameMap && nameMap.get(this.targetSlot)) ||
          this.targetSlot.localName}`);
    }

    if (options && options.showUnresolved) {
      if (!this.isResolved(options)) {
        consumeRes.push(`// unresolved slot-connection: ${options.details}`);
      }
    }

    const result = [];
    result.push(consumeRes.join(' '));

    Object.keys(this.providedSlots).forEach(psName => {
      const providedSlot = this.providedSlots[psName];
      const provideRes = [];
      provideRes.push('  provide');
      
      // Only assert that there's a spec for this provided slot if there's a spec for
      // the consumed slot .. otherwise this is just a constraint.
      if (this.slotSpec) {
        const providedSlotSpec = this.slotSpec.getProvidedSlotSpec(psName);
        assert(providedSlotSpec, `Cannot find providedSlotSpec for ${psName}`);
      }
      provideRes.push(`${psName} as ${(nameMap && nameMap.get(providedSlot)) || providedSlot}`);
      result.push(provideRes.join(' '));
    });
    return result.join('\n');
  }
}
