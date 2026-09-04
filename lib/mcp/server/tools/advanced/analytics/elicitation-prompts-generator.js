/**
 * Elicitation Prompts Generator
 *
 * Generates intelligent, context-aware prompts for user interaction based on
 * agent execution patterns, performance metrics, and database context.
 *
 * @module elicitation-prompts-generator
 * @version 1.0.0
 * @extracted Phase 3.5 Task 2B (Dec 2025) from sdk-native-advanced-tools.js
 *
 * @description Provides intelligent prompt generation:
 *   - Performance-based interaction prompts
 *   - Category-aware comparative analysis prompts
 *   - Database-driven contextual suggestions
 */

// Use global Prisma singleton (time-bomb-detection-pattern.md - Category 6: Singleton Misuse)
// Creating new PrismaClient() per module exhausts connection pool
const { prisma } = require('../../../../../prisma');
// BUG-BASIC-XSS-1 Phase 2.7: 6 sites echo DB-sourced template/POV/phase/task names.
const { sanitizeForResponse } = require('../../response-sanitizer');

/**
 * Elicitation Prompts Generator
 *
 * @class ElicitationPromptsGenerator
 * @description Generates context-aware prompts based on agent execution analysis.
 */
class ElicitationPromptsGenerator {
  /**
   * Creates Elicitation Prompts Generator instance
   *
   * @param {Object} logger - Logger instance for debugging
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Generate performance-based elicitation prompts
   *
   * @param {Array<Object>} executions - Agent execution records
   * @param {string} executions[].status - Execution status (COMPLETED, FAILED, etc.)
   * @param {number} [executions[].executionTime] - Execution duration (ms)
   *
   * @returns {Promise<Array<Object>>} Generated prompts
   * @returns {string} returns[].text - Prompt text
   * @returns {string} [returns[].context] - Additional context for prompt
   *
   * @description Analyzes execution performance patterns to suggest improvements.
   *   Generates prompts for failed executions, performance issues, and optimization opportunities.
   *
   * @example
   * const prompts = await generator.generatePerformanceElicitationPrompts([
   *   { status: 'COMPLETED', executionTime: 5000 },
   *   { status: 'FAILED', error: 'Timeout' }
   * ]);
   */
  async generatePerformanceElicitationPrompts(executions) {
    try {
      if (!executions || executions.length === 0) {
        return [];
      }

      const prompts = [];

      // Analyze execution performance patterns
      const completedExecutions = executions.filter(exec =>
        exec.status === 'COMPLETED' || exec.status === 'SUCCESS'
      );
      const failedExecutions = executions.filter(exec => exec.status === 'FAILED');

      const successRate = executions.length > 0 ?
        (completedExecutions.length / executions.length) * 100 : 0;

      // Performance-based prompts
      if (successRate < 70 && failedExecutions.length > 0) {
        prompts.push({
          text: "Investigate execution failures to improve template reliability",
          context: `Success rate: ${successRate.toFixed(1)}% (${failedExecutions.length} failures)`,
          type: "performance_improvement",
          priority: "high"
        });
      }

      if (successRate > 90 && completedExecutions.length >= 3) {
        prompts.push({
          text: "Consider promoting this high-performing template for wider use",
          context: `Excellent success rate: ${successRate.toFixed(1)}%`,
          type: "template_promotion",
          priority: "medium"
        });
      }

      // Execution time analysis
      const executionTimes = completedExecutions
        .filter(exec => exec.endTime && exec.startTime)
        .map(exec => new Date(exec.endTime) - new Date(exec.startTime));

      if (executionTimes.length > 0) {
        const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
        const avgSeconds = Math.round(avgTime / 1000);

        if (avgSeconds > 120) { // Over 2 minutes
          prompts.push({
            text: "Optimize template for faster execution times",
            context: `Average execution time: ${avgSeconds}s`,
            type: "performance_optimization",
            priority: "medium"
          });
        }

        if (avgSeconds < 30 && successRate > 80) { // Under 30 seconds with good success
          prompts.push({
            text: "Template shows excellent speed and reliability - consider scaling usage",
            context: `Fast execution: ${avgSeconds}s average, ${successRate.toFixed(1)}% success`,
            type: "scaling_opportunity",
            priority: "low"
          });
        }
      }

      // Template-specific analysis using database queries
      const templates = [...new Set(executions
        .filter(exec => exec.agentTemplate)
        .map(exec => exec.agentTemplate.id)
      )];

      if (templates.length > 0) {
        // Get comprehensive template performance data
        const templateStats = await prisma.agentTemplate.findMany({
          where: { id: { in: templates } },
          select: {
            id: true,
            name: true,
            category: true,
            _count: {
              select: {
                executions: {
                  where: {
                    status: { in: ['COMPLETED', 'SUCCESS'] }
                  }
                }
              }
            }
          },
          take: 50
        });

        for (const template of templateStats) {
          const templateExecutions = executions.filter(exec =>
            exec.agentTemplate?.id === template.id
          );

          if (template._count.executions < 5 && templateExecutions.length >= 2) {
            prompts.push({
              text: `Increase usage of "${sanitizeForResponse(template.name)}" template to build performance baseline`,
              context: `Only ${template._count.executions} total successful executions`,
              type: "usage_increase",
              priority: "low"
            });
          }
        }
      }

      return prompts;

    } catch (error) {
      this.logger.error('Failed to generate performance elicitation prompts:', error);
      return [{
        text: "Review execution patterns for optimization opportunities",
        context: "Performance analysis unavailable",
        type: "generic_performance",
        priority: "low"
      }];
    }
  }

  /**
   * Generate category-aware comparative prompts
   * Suggests comparisons based on template categories and complexity levels
   */
  async generateCategoryComparativePrompts(executions) {
    try {
      if (!executions || executions.length === 0) {
        return [];
      }

      const prompts = [];

      // Group executions by template category
      const categoryGroups = {};
      executions.forEach(exec => {
        if (exec.agentTemplate?.category) {
          const category = exec.agentTemplate.category;
          if (!categoryGroups[category]) {
            categoryGroups[category] = [];
          }
          categoryGroups[category].push(exec);
        }
      });

      const categories = Object.keys(categoryGroups);

      // Multi-category analysis
      if (categories.length > 1) {
        // Compare performance across categories
        const categoryPerformance = {};
        for (const category of categories) {
          const categoryExecs = categoryGroups[category];
          const successRate = categoryExecs.filter(exec =>
            exec.status === 'COMPLETED' || exec.status === 'SUCCESS'
          ).length / categoryExecs.length * 100;

          categoryPerformance[category] = {
            count: categoryExecs.length,
            successRate: successRate
          };
        }

        // Find best and worst performing categories
        const sortedCategories = categories.sort((a, b) =>
          categoryPerformance[b].successRate - categoryPerformance[a].successRate
        );

        if (sortedCategories.length >= 2) {
          const bestCategory = sortedCategories[0];
          const worstCategory = sortedCategories[sortedCategories.length - 1];

          const bestRate = categoryPerformance[bestCategory].successRate;
          const worstRate = categoryPerformance[worstCategory].successRate;

          if (bestRate - worstRate > 20) { // Significant difference
            prompts.push({
              text: `Compare ${bestCategory} templates (${bestRate.toFixed(1)}% success) with ${worstCategory} templates (${worstRate.toFixed(1)}% success)`,
              context: `Identify patterns from high-performing category to improve lower-performing ones`,
              type: "category_comparison",
              priority: "medium"
            });
          }
        }

        // Suggest cross-category template combinations
        if (categories.includes('ANALYSIS') && categories.includes('AUTOMATION')) {
          prompts.push({
            text: "Consider combining Analysis and Automation templates for comprehensive workflows",
            context: "Both categories present - potential for integrated approach",
            type: "workflow_integration",
            priority: "low"
          });
        }
      }

      // Single category deep analysis
      if (categories.length === 1) {
        const category = categories[0];
        const categoryExecs = categoryGroups[category];

        // Get similar templates in same category from database
        const similarTemplates = await prisma.agentTemplate.findMany({
          where: {
            category: category,
            status: 'ACTIVE'
          },
          select: {
            id: true,
            name: true,
            complexity: true,
            _count: {
              select: {
                executions: {
                  where: {
                    status: { in: ['COMPLETED', 'SUCCESS'] }
                  }
                }
              }
            }
          },
          take: 5
        });

        if (similarTemplates.length > 1) {
          prompts.push({
            text: `Explore other ${category} templates for comparison and best practices`,
            context: `${similarTemplates.length} similar templates available`,
            type: "template_exploration",
            priority: "low"
          });
        }

        // Complexity-based suggestions
        const complexities = [...new Set(categoryExecs
          .filter(exec => exec.agentTemplate?.complexity)
          .map(exec => exec.agentTemplate.complexity)
        )];

        if (complexities.length === 1 && complexities[0] === 'SIMPLE') {
          prompts.push({
            text: "Consider trying MEDIUM complexity templates for enhanced capabilities",
            context: `Currently using only ${complexities[0]} complexity level`,
            type: "complexity_progression",
            priority: "low"
          });
        }

        if (complexities.length === 1 && complexities[0] === 'COMPLEX') {
          prompts.push({
            text: "Compare with MEDIUM complexity alternatives for potentially faster execution",
            context: "Using only complex templates - simpler alternatives may be more efficient",
            type: "complexity_optimization",
            priority: "medium"
          });
        }
      }

      // Database-driven category insights
      if (categories.length > 0) {
        // Get category usage statistics
        const categoryStats = await prisma.agentExecution.groupBy({
          by: ['status'],
          where: {
            agentTemplate: {
              category: { in: categories }
            },
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          },
          _count: {
            status: true
          }
        });

        const totalExecutions = categoryStats.reduce((sum, stat) => sum + stat._count.status, 0);
        const successfulExecutions = categoryStats
          .filter(stat => stat.status === 'COMPLETED' || stat.status === 'SUCCESS')
          .reduce((sum, stat) => sum + stat._count.status, 0);

        const overallCategoryRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

        if (overallCategoryRate > 85 && totalExecutions > 10) {
          prompts.push({
            text: `${categories.join(', ')} categories show excellent performance - consider expanding usage`,
            context: `${overallCategoryRate.toFixed(1)}% success rate across ${totalExecutions} executions in last 30 days`,
            type: "category_expansion",
            priority: "low"
          });
        }
      }

      return prompts;

    } catch (error) {
      this.logger.error('Failed to generate category comparative prompts:', error);
      return [{
        text: "Compare templates across different categories for optimization insights",
        context: "Category analysis unavailable",
        type: "generic_comparison",
        priority: "low"
      }];
    }
  }

  /**
   * Generate database-driven context suggestions
   * Provides POV, phase, and team-level contextual recommendations
   */
  async generateDatabaseContextSuggestions(executions) {
    try {
      if (!executions || executions.length === 0) {
        return [];
      }

      const prompts = [];

      // Get unique task IDs and POV context from executions
      const taskIds = [...new Set(executions
        .filter(exec => exec.task?.id)
        .map(exec => exec.task.id)
      )];

      if (taskIds.length === 0) {
        return [];
      }

      // Get comprehensive context from database
      const taskContext = await prisma.task.findMany({
        where: { id: { in: taskIds } },
        include: {
          pov: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              startDate: true,
              endDate: true,
              objective: true
            }
          },
          phase: {
            select: {
              id: true,
              name: true,
              description: true,
              type: true
            }
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              executions: true,
              subTasks: true
            }
          }
        },
        take: 100
      });

      // POV-level context suggestions
      const povs = [...new Set(taskContext.map(task => task.pov?.id).filter(Boolean))];

      if (povs.length > 0) {
        // Get POV completion status
        for (const task of taskContext) {
          if (task.pov) {
            const pov = task.pov;

            // Timeline-based suggestions
            if (pov.endDate && new Date(pov.endDate) < new Date()) {
              prompts.push({
                text: `POV "${sanitizeForResponse(pov.title)}" is past deadline - review completion status`,
                context: `Deadline was ${new Date(pov.endDate).toLocaleDateString()}`,
                type: "timeline_alert",
                priority: "high"
              });
            }

            if (pov.endDate && new Date(pov.endDate) - new Date() < 7 * 24 * 60 * 60 * 1000) {
              prompts.push({
                text: `POV "${sanitizeForResponse(pov.title)}" deadline approaching - prioritize remaining tasks`,
                context: `Deadline: ${new Date(pov.endDate).toLocaleDateString()}`,
                type: "deadline_warning",
                priority: "medium"
              });
            }

            // Priority-based suggestions
            if (pov.priority === 'URGENT') {
              prompts.push({
                text: `Focus on URGENT POV "${sanitizeForResponse(pov.title)}" completion`,
                context: `High priority POV requires immediate attention`,
                type: "priority_focus",
                priority: "high"
              });
            }
          }
        }

        // Get related tasks in same POVs
        const relatedTasks = await prisma.task.findMany({
          where: {
            povId: { in: povs },
            id: { notIn: taskIds }
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            _count: {
              select: {
                executions: {
                  where: {
                    status: { in: ['COMPLETED', 'SUCCESS'] }
                  }
                }
              }
            }
          },
          take: 5
        });

        if (relatedTasks.length > 0) {
          const pendingTasks = relatedTasks.filter(task =>
            task.status === 'PENDING' || task.status === 'IN_PROGRESS'
          );

          if (pendingTasks.length > 0) {
            prompts.push({
              text: `Consider related tasks in same POV for comprehensive completion`,
              context: `${pendingTasks.length} related task(s) pending`,
              type: "related_tasks",
              priority: "medium"
            });
          }
        }
      }

      // Phase-level context suggestions
      const phases = [...new Set(taskContext.map(task => task.phase?.id).filter(Boolean))];

      if (phases.length > 0) {
        // Get phase completion statistics
        const phaseStats = await prisma.phase.findMany({
          where: { id: { in: phases } },
          include: {
            _count: {
              select: {
                tasks: true,
                tasks: {
                  where: {
                    status: 'COMPLETED'
                  }
                }
              }
            }
          },
          take: 50
        });

        for (const phase of phaseStats) {
          const completionRate = phase._count.tasks > 0 ?
            (phase._count.tasks / phase._count.tasks) * 100 : 0;

          if (completionRate > 80) {
            prompts.push({
              text: `Phase "${sanitizeForResponse(phase.name)}" is nearly complete - prepare for next phase`,
              context: `${completionRate.toFixed(1)}% tasks completed`,
              type: "phase_transition",
              priority: "medium"
            });
          }
        }
      }

      // Team collaboration context
      const assignees = [...new Set(taskContext.map(task => task.assignee?.id).filter(Boolean))];

      if (assignees.length > 1) {
        prompts.push({
          text: "Coordinate with team members on related tasks",
          context: `${assignees.length} team members involved`,
          type: "team_coordination",
          priority: "medium"
        });

        // Get execution patterns for team members
        const teamExecutions = await prisma.agentExecution.findMany({
          where: {
            task: {
              assigneeId: { in: assignees }
            },
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          },
          include: {
            task: {
              select: {
                assigneeId: true,
                assignee: {
                  select: {
                    name: true
                  }
                }
              }
            }
          },
          take: 1000
        });

        const teamPerformance = {};
        for (const exec of teamExecutions) {
          const assigneeId = exec.task?.assigneeId;
          if (assigneeId) {
            if (!teamPerformance[assigneeId]) {
              teamPerformance[assigneeId] = {
                name: exec.task.assignee?.name || 'Unknown',
                total: 0,
                successful: 0
              };
            }
            teamPerformance[assigneeId].total++;
            if (exec.status === 'COMPLETED' || exec.status === 'SUCCESS') {
              teamPerformance[assigneeId].successful++;
            }
          }
        }

        // Identify high performers for knowledge sharing
        const highPerformers = Object.entries(teamPerformance)
          .filter(([_, stats]) => stats.total > 2 && (stats.successful / stats.total) > 0.8)
          .map(([_, stats]) => stats.name);

        if (highPerformers.length > 0) {
          prompts.push({
            text: `Share best practices with ${highPerformers.join(', ')} for improved outcomes`,
            context: "High-performing team members identified",
            type: "knowledge_sharing",
            priority: "low"
          });
        }
      }

      // Historical pattern analysis
      const executionHistory = await prisma.agentExecution.findMany({
        where: {
          task: {
            povId: { in: povs }
          },
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        select: {
          status: true,
          agentTemplate: {
            select: {
              category: true
            }
          }
        },
        take: 2000
      });

      if (executionHistory.length > 0) {
        const successRate = executionHistory.filter(exec =>
          exec.status === 'COMPLETED' || exec.status === 'SUCCESS'
        ).length / executionHistory.length * 100;

        if (successRate < 60) {
          prompts.push({
            text: "Review POV execution patterns - success rate below optimal",
            context: `Current success rate: ${successRate.toFixed(1)}%`,
            type: "pattern_analysis",
            priority: "high"
          });
        }

        // Category usage patterns
        const categoryUsage = {};
        executionHistory.forEach(exec => {
          if (exec.agentTemplate?.category) {
            const category = exec.agentTemplate.category;
            categoryUsage[category] = (categoryUsage[category] || 0) + 1;
          }
        });

        const dominantCategory = Object.entries(categoryUsage)
          .sort(([,a], [,b]) => b - a)[0];

        if (dominantCategory && dominantCategory[1] > executionHistory.length * 0.7) {
          prompts.push({
            text: `Consider diversifying beyond ${dominantCategory[0]} templates`,
            context: `${dominantCategory[1]}/${executionHistory.length} executions use this category`,
            type: "template_diversification",
            priority: "low"
          });
        }
      }

      return prompts;

    } catch (error) {
      this.logger.error('Failed to generate database context suggestions:', error);
      return [{
        text: "Review task and POV context for optimization opportunities",
        context: "Context analysis unavailable",
        type: "generic_context",
        priority: "low"
      }];
    }
  }

  /**
   * Generate artifact-aware elicitation prompts (Apr 2026)
   *
   * Inspects each execution's result.json artifact for confidence score and
   * artifact size, and emits prompts that point the user at the natural next
   * action — investigating bounded-confidence results, surfacing escalations,
   * or summarising large deliverables.
   *
   * Designed primarily for the Pipeline Harness UX where each child execution
   * produces a result.json + report.md and the user benefits from per-output
   * actionable hints, not just per-execution metadata hints.
   *
   * @param {Array<Object>} executions - Agent execution records (raw Prisma shape)
   * @returns {Promise<Array<Object>>} Generated prompts
   */
  async generateArtifactElicitationPrompts(executions) {
    try {
      if (!executions || executions.length === 0) {
        return [];
      }

      const prompts = [];
      const LARGE_ARTIFACT_BYTES = 50_000; // 50 KB threshold

      for (const exec of executions) {
        if (!exec.artifacts || exec.artifacts.length === 0) continue;

        const taskTitle = exec.task?.title || `task ${exec.taskId || exec.id}`;
        const resultArtifact = exec.artifacts.find((a) => a.name === 'result.json');

        // Parse confidence score from result.json content (when present)
        let confidenceScore = null;
        if (resultArtifact?.content) {
          try {
            const parsed = JSON.parse(resultArtifact.content);
            if (typeof parsed.confidenceScore === 'number') {
              confidenceScore = parsed.confidenceScore;
            }
          } catch { /* not JSON — skip */ }
        }

        // Rule 1 — Low confidence escalation (<50): the algorithm escalates
        if (confidenceScore !== null && confidenceScore < 50) {
          prompts.push({
            // sec-ops HIGH-2 (2026-05-22): rule 3 below sanitized taskTitle
            // but rules 1+2 didn't — BC71 inconsistency in the same function.
            text: `"${sanitizeForResponse(taskTitle)}" escalated for human review (confidence ${confidenceScore}/100) — read the diagnostics in result.json`,
            context: `Confidence below the 50 threshold means the algorithm escalated rather than retried. The result.json finalResponse usually names the blocker.`,
            type: 'artifact_escalation',
            priority: 'high',
          });
        }
        // Rule 2 — Bounded confidence (50-79): retry band or first-attempt warning
        else if (confidenceScore !== null && confidenceScore >= 50 && confidenceScore < 80) {
          const band = confidenceScore < 70 ? 'retry band' : 'bounded';
          prompts.push({
            text: `"${sanitizeForResponse(taskTitle)}" landed in the ${band} (confidence ${confidenceScore}/100) — investigate the limiting factor noted in the result`,
            context: confidenceScore < 70
              ? `Scores in the 50-69 retry band indicate the algorithm tried diagnostic feedback. Check whether the retry succeeded.`
              : `Scores in the 70-79 range often have an explicit limitation noted in the agent's finalResponse (e.g., "bounded by lack of system access").`,
            type: 'artifact_bounded_confidence',
            priority: confidenceScore < 70 ? 'high' : 'medium',
          });
        }

        // Rule 3 — Large deliverable summary
        const largeArtifact = exec.artifacts.find(
          (a) => (a.content?.length || 0) > LARGE_ARTIFACT_BYTES,
        );
        if (largeArtifact) {
          const sizeKB = Math.round((largeArtifact.content.length || 0) / 1024);
          prompts.push({
            text: `Generate a TL;DR summary of "${sanitizeForResponse(taskTitle)}" (${sanitizeForResponse(largeArtifact.name)}, ~${sizeKB} KB)`,
            context: `Large deliverables (>50 KB) are common from harness pipelines and executive briefings. A summary turns the raw output into something a user can scan in seconds.`,
            type: 'artifact_summary',
            priority: 'medium',
          });
        }
      }

      // Rule 4 — Multi-execution batch (rare via current call sites but supported)
      if (executions.length >= 3) {
        prompts.push({
          text: `Synthesize cross-execution findings from this batch of ${executions.length} executions`,
          context: `Multi-execution batches typically come from a pipeline or a re-run series. A synthesis call surfaces patterns across them in one response.`,
          type: 'artifact_batch_synthesis',
          priority: 'medium',
        });
      }

      return prompts;
    } catch (error) {
      this.logger.error('Failed to generate artifact elicitation prompts:', error);
      return [];
    }
  }
}

module.exports = { ElicitationPromptsGenerator };
