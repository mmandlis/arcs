// Copyright (c) 2017 Google Inc. All rights reserved.
// This code may only be used under the BSD style license found at
// http://polymer.github.io/LICENSE.txt
// Code distributed by Google as part of this project is also
// subject to an additional IP rights grant found at
// http://polymer.github.io/PATENTS.txt

import {Strategy} from '../../strategizer/strategizer.js';
import {Recipe} from '../ts-build/recipe/recipe.js';
import {Walker} from '../ts-build/recipe/walker.js';
import {Handle} from '../ts-build/recipe/handle.js';
import {assert} from '../../platform/assert-web.js';

// This strategy substitutes '&verb' declarations with recipes,
// according to the following conditions:
// 1) the recipe is named by the verb described in the particle
// 2) the recipe has the slot pattern (if any) owned by the particle
//
// The strategy also reconnects any slots that were connected to the
// particle, so that the substituted recipe fully takes the particle's place.
//
// Note that the recipe may have the slot pattern multiple times over, but
// this strategy currently only connects the first instance of the pattern up
// if there are multiple instances.
export class MatchRecipeByVerb extends Strategy {
  constructor(arc) {
    super();
    this._arc = arc;
  }

  async generate(inputParams) {
    const arc = this._arc;
    return Recipe.over(this.getResults(inputParams), new class extends Walker {
      onParticle(recipe, particle) {
        if (particle.name) {
          // Particle already has explicit name.
          return;
        }

        let recipes = arc.context.findRecipesByVerb(particle.primaryVerb);

        // Extract slot information from recipe. This is extracted in the form:
        // {consume-slot-name: targetSlot: <slot>, providedSlots: {provide-slot-name: <slot>}}
        //
        // Note that slots are only included if connected to other components of the recipe - e.g.
        // the target slot has a source connection.
        const slotConstraints = {};
        for (const consumeSlot of Object.values(particle.consumedSlotConnections)) {
          const targetSlot = consumeSlot.targetSlot && consumeSlot.targetSlot.sourceConnection ? consumeSlot.targetSlot : null;
          slotConstraints[consumeSlot.name] = {targetSlot, providedSlots: {}};
          for (const providedSlot of Object.keys(consumeSlot.providedSlots)) {
            const sourceSlot = consumeSlot.providedSlots[providedSlot].consumeConnections.length > 0 ? consumeSlot.providedSlots[providedSlot] : null;
            slotConstraints[consumeSlot.name].providedSlots[providedSlot] = sourceSlot;
          }
        }

        const handleConstraints = {named: {}, unnamed: []};
        for (const handleConnection of Object.values(particle.connections)) {
          handleConstraints.named[handleConnection.name] = {direction: handleConnection.direction, handle: handleConnection.handle};
        }
        for (const unnamedConnection of particle.unnamedConnections) {
          handleConstraints.unnamed.push({direction: unnamedConnection.direction, handle: unnamedConnection.handle});
        }

        recipes = recipes.filter(recipe => MatchRecipeByVerb.satisfiesSlotConstraints(recipe, slotConstraints))
                         .filter(recipe => MatchRecipeByVerb.satisfiesHandleConstraints(recipe, handleConstraints));

        return recipes.map(recipe => {
          return (outputRecipe, particleForReplacing) => {
            const {handles, particles, slots} = recipe.mergeInto(outputRecipe);

            particleForReplacing.remove();


            for (const consumeSlot in slotConstraints) {
              if (slotConstraints[consumeSlot].targetSlot || Object.values(slotConstraints[consumeSlot].providedSlots).filter(a => a != null).length > 0) {
                let slotMapped = false;
                for (const particle of particles) {
                  if (MatchRecipeByVerb.slotsMatchConstraint(particle.consumedSlotConnections, consumeSlot, slotConstraints[consumeSlot].providedSlots)) {
                    if (slotConstraints[consumeSlot].targetSlot) {
                      const {mappedSlot} = outputRecipe.updateToClone({mappedSlot: slotConstraints[consumeSlot].targetSlot});
                      particle.consumedSlotConnections[consumeSlot]._targetSlot = mappedSlot;
                      mappedSlot.consumeConnections.push(particle.consumedSlotConnections[consumeSlot]);
                    }
                    for (const slotName in slotConstraints[consumeSlot].providedSlots) {
                      const slot = slotConstraints[consumeSlot].providedSlots[slotName];
                      if (slot == null) {
                        continue;
                      }
                      const {mappedSlot} = outputRecipe.updateToClone({mappedSlot: slot});
                      const oldSlot = particle.consumedSlotConnections[consumeSlot].providedSlots[slotName];
                      oldSlot.remove();
                      particle.consumedSlotConnections[consumeSlot].providedSlots[slotName] = mappedSlot;
                      mappedSlot._sourceConnection = particle.consumedSlotConnections[consumeSlot];
                    }
                    slotMapped = true;
                    break;
                  }
                }
                assert(slotMapped);
              }
            }

            function tryApplyHandleConstraint(name, connection, constraint, handle) {
              if (connection.handle != null) {
                return false;
              }
              if (!MatchRecipeByVerb.connectionMatchesConstraint(
                      connection, constraint)) {
                return false;
              }
              for (let i = 0; i < handle.connections.length; i++) {
                const candidate = handle.connections[i];
                if (candidate.particle == particleForReplacing && candidate.name == name) {
                  connection._handle = handle;
                  handle.connections[i] = connection;
                  return true;
                }
              }
              return false;
            }

            function applyHandleConstraint(name, constraint, handle) {
              const {mappedHandle} = outputRecipe.updateToClone({mappedHandle: handle});
              for (const particle of particles) {
                if (name) {
                  if (tryApplyHandleConstraint(
                          name,
                          particle.connections[name],
                          constraint,
                          mappedHandle)) {
                    return true;
                  }
                } else {
                  for (const connection of Object.values(particle.connections)) {
                    if (tryApplyHandleConstraint(
                            name, connection, constraint, mappedHandle)) {
                      return true;
                    }
                  }
                }
              }
              return false;
            }

            for (const name in handleConstraints.named) {
              if (handleConstraints.named[name].handle) {
                assert(applyHandleConstraint(
                    name,
                    handleConstraints.named[name],
                    handleConstraints.named[name].handle));
              }
            }

            for (const connection of handleConstraints.unnamed) {
              if (connection.handle) {
                assert(
                    applyHandleConstraint(null, connection, connection.handle));
              }
            }

            return 1;
          };
        });
      }
    }(Walker.Permuted), this);
  }

  static satisfiesHandleConstraints(recipe, handleConstraints) {
    for (const handleName in handleConstraints.named) {
      if (!MatchRecipeByVerb.satisfiesHandleConnection(
              recipe, handleName, handleConstraints.named[handleName])) {
        return false;
      }
    }
    for (const handleData of handleConstraints.unnamed) {
      if (!MatchRecipeByVerb.satisfiesUnnamedHandleConnection(
              recipe, handleData)) {
        return false;
      }
    }
    return true;
  }

  static satisfiesUnnamedHandleConnection(recipe, handleData) {
    // refuse to match unnamed handle connections unless some type information is present.
    if (!handleData.handle) {
      return false;
    }
    for (const particle of recipe.particles) {
      for (const connection of Object.values(particle.connections)) {
        if (MatchRecipeByVerb.connectionMatchesConstraint(
                connection, handleData)) {
          return true;
        }
      }
    }
    return false;
  }

  static satisfiesHandleConnection(recipe, handleName, handleData) {
    for (const particle of recipe.particles) {
      if (particle.connections[handleName]) {
        if (MatchRecipeByVerb.connectionMatchesConstraint(
                particle.connections[handleName], handleData)) {
          return true;
        }
      }
    }
    return false;
  }

  static connectionMatchesConstraint(connection, handleData) {
    if (connection.direction !== handleData.direction) {
      return false;
    }
    if (!handleData.handle) {
      return true;
    }
    return Handle.effectiveType(handleData.handle._mappedType, handleData.handle.connections.concat(connection)) != null;
  }

  static satisfiesSlotConstraints(recipe, slotConstraints) {
    for (const slotName in slotConstraints) {
      if (!MatchRecipeByVerb.satisfiesSlotConnection(
              recipe, slotName, slotConstraints[slotName])) {
        return false;
      }
    }
    return true;
  }

  static satisfiesSlotConnection(recipe, slotName, constraints) {
    for (const particle of recipe.particles) {
      if (MatchRecipeByVerb.slotsMatchConstraint(
              particle.consumedSlotConnections, slotName, constraints)) {
        return true;
      }
    }
    return false;
  }

  static slotsMatchConstraint(connections, name, constraints) {
    if (connections[name] == null) {
      return false;
    }
    if (connections[name]._targetSlot != null &&
        constraints.targetSlot != null) {
      return false;
    }
    for (const provideName in constraints.providedSlots) {
      if (connections[name].providedSlots[provideName] == null) {
        return false;
      }
    }
    return true;
  }
}
