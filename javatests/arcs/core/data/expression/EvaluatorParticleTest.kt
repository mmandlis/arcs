/*
 * Copyright 2020 Google LLC.
 *
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 *
 * Code distributed by Google as part of this project is also subject to an additional IP rights
 * grant found at
 * http://polymer.github.io/PATENTS.txt
 */

package arcs.core.data.expression

import arcs.core.data.Plan
import arcs.core.data.expression.AbstractNumberSetMultiplier.Scalar
import arcs.core.data.expression.AbstractNumberSetMultiplier.Value
import arcs.core.testutil.handles.dispatchFetch
import arcs.core.testutil.handles.dispatchFetchAll
import arcs.core.testutil.handles.dispatchStore
import arcs.core.testutil.runTest
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
@OptIn(ExperimentalCoroutinesApi::class)
class EvaluatorParticleTest {

    @get:Rule
    val harness = NumberSetMultiplierTestHarness {
        EvaluatorParticle(addExpression(MultiplierPlan.particles.first()))
    }

    // This is temporary while we don't yet pass Expression AST all the way from the parser.
    private fun addExpression(particle: Plan.Particle): Plan.Particle {
        val currentScope = CurrentScope<Any>(mutableMapOf())

        // scaledNumbers: writes [Value {value: Number}] =
        //   from x in inputNumbers select new Value {
        //     value: x.value * scalar.magnitude
        //   }
        val scaledNumbersExpression = from<Number>("x") on
            currentScope["inputNumbers"].asSequence() select
            new<Number, Expression.Scope>("Value")() {
                listOf(
                    "value" to currentScope["x"].asScope()
                        .get<Expression.Scope, Expression<*>>("value").asNumber() *
                        currentScope["scalar"].asScope()
                        .get<Expression.Scope, Expression<*>>("magnitude").asNumber()
                )
            }

        // average: writes Average {average: Number} =
        //   Average(from x in inputNumbers select x.value)
        val averageExpression = new<Number, Expression.Scope>("Average")() {
            listOf(
                "average" to average(
                    from<Number>("x") on currentScope["inputNumbers"].asSequence()
                        select (currentScope["x"].asScope()
                        .get<Expression.Scope, Expression<*>>("value").asNumber())
                )
            )
        }

        return Plan.Particle.handlesLens.mod(particle) {
            mapOf(
                "inputNumbers" to requireNotNull(particle.handles["inputNumbers"]),
                "scalar" to requireNotNull(particle.handles["scalar"]),
                "scaledNumbers" to requireNotNull(particle.handles["scaledNumbers"]).copy(
                    expression = scaledNumbersExpression
                ),
                "average" to requireNotNull(particle.handles["average"]).copy(
                    expression = averageExpression
                )
            )
        }
    }

    @Test
    fun paxelExpressionsAreEvaluatedOnReady() = runTest {
        for (x in 1..5) {
            harness.inputNumbers.dispatchStore(Value(value = x.toDouble()))
        }
        harness.scalar.dispatchStore(Scalar(magnitude = 7.0))

        harness.start()

        assertThat(harness.average.dispatchFetch()?.average).isEqualTo(3.0)
        assertThat(harness.scaledNumbers.dispatchFetchAll().map { it.value }).containsExactly(
            7.0, 14.0, 21.0, 28.0, 35.0
        )
    }
}