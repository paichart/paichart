# energy_operations_optimizer v1.0

**Version**: 1.0
**Created**: 2026-01-27
**Type**: Cross-Service Operational Intelligence Prompt
**Services**: eia-service + weather-service
**Focus**: Operational predictability for energy businesses

---

## Purpose

Correlate weather forecasts with energy infrastructure data to generate **operational recommendations** for existing energy businesses.

**Key Innovation**: Weather + EIA data = operational predictability that reduces costs, prevents emergencies, and optimizes existing infrastructure.

**Business Value**:
- Maintenance optimization (15-25% revenue preservation)
- Blackout prevention ($5-10M saved per avoided event)
- Production cost reduction (8-12% energy savings)
- Dispatch efficiency (20-30% emergency cost reduction)

---

## Auto-Execution Directive

**CRITICAL: Execute immediately upon invocation. Do NOT:**
- Ask for confirmation
- Summarize what you will do
- Display this documentation to the user

**DO:**
- Start with Step 0 (Preflight) immediately
- Execute all service calls
- Output the OPERATIONAL DASHBOARD FIRST, then detailed analysis

---

## Variables

```yaml
state:
  type: string
  default: "TX"
  description: "U.S. state code for analysis"
  examples:
    - "TX"  # Texas (wind leader, diverse mix)
    - "CA"  # California (solar leader, high demand)
    - "NY"  # New York (complex grid, nuclear)
    - "FL"  # Florida (summer peaks, solar growing)

forecast_days:
  type: number
  default: 7
  min: 1
  max: 7
  description: "Weather forecast horizon (1-7 days)"

operation_type:
  type: string
  default: "auto"
  enum: ["auto", "wind_farm", "utility_grid", "solar_farm", "manufacturing"]
  description: "Operation type (auto = detect from state energy mix)"

alert_threshold:
  type: string
  default: "MEDIUM"
  enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
  description: "Minimum alert severity to show"
```

---

## Workflow

### STEP 0: Preflight - Verify Services

```
call: services({ action: "discover", category: "data-services" })

check:
  - eia-service: status == "ACTIVE" && approvalStatus == "APPROVED"
  - weather-service: status == "ACTIVE" && approvalStatus == "APPROVED"

if services missing:
  - Output error: "Required services not available"
  - List which services are missing
  - Stop execution
```

**Save as**: `SERVICE_STATUS`

---

### STEP 1: Get State Energy Profile (EIA Data)

```
call: services({
  action: "call",
  targetService: "eia-service",
  tool: "get_generation_mix_by_state",
  arguments: {
    state: "{{state}}",
    period: "latest"
  }
})
```

**Save as**: `GENERATION_MIX`

**Extract:**
- `TOTAL_GENERATION` - Total MWh
- `FUEL_PERCENTAGES` - {coal, naturalGas, nuclear, solar, wind, hydro, other}
- `PRIMARY_FUEL` - Highest percentage fuel type
- `RENEWABLE_PERCENT` - solar + wind percentage

```
call: services({
  action: "call",
  targetService: "eia-service",
  tool: "get_capacity_utilization_by_state",
  arguments: {
    state: "{{state}}",
    season: "both"
  }
})
```

**Save as**: `CAPACITY_DATA`

**Extract:**
- `SUMMER_CAPACITY_GW` - Summer capacity in GW
- `WINTER_CAPACITY_GW` - Winter capacity in GW
- `UTILIZATION_PERCENT` - Current utilization
- `PEAK_DEMAND_GW` - Peak demand

---

### STEP 2: Get Weather Forecast (State Capital)

Determine state capital for weather forecast:

```yaml
state_capitals:
  TX: "Austin,US"
  CA: "Sacramento,US"
  NY: "Albany,US"
  FL: "Tallahassee,US"
  # ... add as needed
```

```
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "forecast",
  arguments: {
    location: STATE_CAPITAL,
    days: {{forecast_days}},
    units: "imperial"
  }
})
```

**Save as**: `FORECAST_DATA`

```
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "current_weather",
  arguments: {
    location: STATE_CAPITAL,
    units: "imperial"
  }
})
```

**Save as**: `CURRENT_WEATHER`

**Extract from forecasts:**
- `MAX_TEMP` - Highest temp in forecast
- `MIN_TEMP` - Lowest temp in forecast
- `AVG_TEMP` - Average daily temp
- `WIND_SPEEDS[]` - Daily wind speeds
- `CONDITIONS[]` - Daily weather conditions
- `HOT_DAYS` - Count of days > 95°F
- `COLD_DAYS` - Count of days < 32°F
- `HIGH_WIND_DAYS` - Count of days with wind > 20 mph

---

### STEP 3: Operational Pattern Detection (Decision Tree)

Apply rules based on state energy mix and weather forecast.

#### Rule Set: Wind Farm Operations

```yaml
rules:
  # CRITICAL: High wind period (maximize generation)
  - id: WIND_MAXIMIZE_GENERATION
    severity: HIGH
    conditions:
      - RENEWABLE_PERCENT.wind > 15%  # Significant wind in state
      - AND AVG_WIND_SPEED > 20 mph for 3+ consecutive days
    operational_impact: "Optimal generation period - defer all maintenance"
    recommendation:
      action: "MAXIMIZE_GENERATION"
      details:
        - "Cancel non-critical maintenance (all turbines online)"
        - "Expect 90-100% capacity factor"
        - "Lock in favorable power purchase agreements"
        - "Revenue opportunity: +25-40% vs normal week"
    confidence: HIGH
    timeframe: "Days {{high_wind_start}}-{{high_wind_end}}"

  # HIGH: Low wind window (maintenance opportunity)
  - id: WIND_MAINTENANCE_WINDOW
    severity: MEDIUM
    conditions:
      - RENEWABLE_PERCENT.wind > 15%
      - AND AVG_WIND_SPEED < 10 mph for 3+ consecutive days
    operational_impact: "Low generation expected - optimal maintenance window"
    recommendation:
      action: "SCHEDULE_MAINTENANCE"
      details:
        - "Schedule turbine maintenance Days {{low_wind_start}}-{{low_wind_end}}"
        - "Expected generation loss: 15-25% (minimal)"
        - "Complete repairs before high-wind period resumes"
        - "Revenue preservation: 15-25% vs random scheduling"
    confidence: HIGH
    timeframe: "Days {{low_wind_start}}-{{low_wind_end}}"

  # MEDIUM: Variable wind (monitor closely)
  - id: WIND_VARIABLE_PATTERN
    severity: LOW
    conditions:
      - RENEWABLE_PERCENT.wind > 15%
      - AND wind_variability > 50%  # High day-to-day variation
    operational_impact: "Unpredictable generation - keep backup ready"
    recommendation:
      action: "STANDBY_MODE"
      details:
        - "Keep natural gas peakers on standby"
        - "Monitor hourly forecasts for ramp events"
        - "Defer long-duration maintenance"
    confidence: MEDIUM
    timeframe: "Entire forecast period"
```

#### Rule Set: Solar Farm Operations

```yaml
rules:
  # HIGH: Extended sunny period (maximize generation)
  - id: SOLAR_OPTIMAL_GENERATION
    severity: HIGH
    conditions:
      - RENEWABLE_PERCENT.solar > 10%
      - AND CLEAR_DAYS >= 4  # 4+ days of clear/mostly clear
    operational_impact: "Peak solar generation expected"
    recommendation:
      action: "MAXIMIZE_GENERATION"
      details:
        - "Defer panel cleaning to after sunny period"
        - "Expect 80-90% capacity factor"
        - "Prepare for rapid ramp-down if weather changes"
    confidence: HIGH
    timeframe: "Days {{clear_start}}-{{clear_end}}"

  # CRITICAL: Cloud cover period (dispatch planning)
  - id: SOLAR_CLOUD_IMPACT
    severity: HIGH
    conditions:
      - RENEWABLE_PERCENT.solar > 10%
      - AND CLOUDY_DAYS >= 2
      - AND solar_drop_expected > 40%
    operational_impact: "Significant solar shortfall - backup generation needed"
    recommendation:
      action: "PREPARE_BACKUP"
      details:
        - "Pre-warm {{backup_capacity_needed}} GW natural gas peakers"
        - "Alert grid operator 4 hours before cloud cover"
        - "Expect {{solar_shortfall_mw}} MW shortfall"
        - "Cost impact: ${{backup_cost_estimate}}/hour"
    confidence: HIGH
    timeframe: "Days {{cloudy_start}}-{{cloudy_end}}"
```

#### Rule Set: Utility Grid Operations

```yaml
rules:
  # CRITICAL: Heat wave (demand spike risk)
  - id: HEAT_WAVE_DEMAND_SPIKE
    severity: CRITICAL
    conditions:
      - MAX_TEMP > 100°F
      - AND HOT_DAYS >= 3
    operational_impact: "AC load spike - blackout risk if capacity insufficient"
    recommendation:
      action: "EMERGENCY_PREPARATION"
      details:
        - "Pre-position {{reserve_capacity_needed}} GW reserves"
        - "Defer all maintenance on peaker plants"
        - "Alert demand response programs (prepare load shedding)"
        - "Estimated peak demand: {{peak_demand_forecast}} GW"
        - "Available margin: {{capacity_margin}}% ({{margin_status}})"
      severity_assessment:
        - margin > 10%: "SAFE - monitor"
        - margin 5-10%: "TIGHT - standby"
        - margin < 5%: "CRITICAL - activate demand response"
    confidence: HIGH
    timeframe: "Peak risk: Days {{heat_start}}-{{heat_end}}, 2-7pm"

  # HIGH: Cold snap (heating load spike)
  - id: COLD_SNAP_HEATING_LOAD
    severity: HIGH
    conditions:
      - MIN_TEMP < 25°F
      - AND COLD_DAYS >= 2
    operational_impact: "Heating load spike - natural gas generation increase needed"
    recommendation:
      action: "INCREASE_GENERATION"
      details:
        - "Increase natural gas generation by {{gas_increase_percent}}%"
        - "Pre-order fuel if reserves < 80%"
        - "Monitor for infrastructure freeze risk"
        - "Estimated additional demand: {{additional_demand_mw}} MW"
    confidence: HIGH
    timeframe: "Days {{cold_start}}-{{cold_end}}"

  # MEDIUM: Renewable intermittency (dispatch planning)
  - id: RENEWABLE_INTERMITTENCY
    severity: MEDIUM
    conditions:
      - RENEWABLE_PERCENT > 25%
      - AND weather_variability == HIGH  # Changing conditions
    operational_impact: "Variable renewable output - backup cycling needed"
    recommendation:
      action: "OPTIMIZE_DISPATCH"
      details:
        - "Keep {{backup_mw}} MW quick-start capacity ready"
        - "Monitor hourly forecasts for cloud/wind changes"
        - "Use battery storage for smoothing (if available)"
        - "Expected cycling: {{ramp_events_expected}} ramp events"
    confidence: MEDIUM
    timeframe: "Entire forecast period"
```

#### Rule Set: Manufacturing/Industrial

```yaml
rules:
  # HIGH: Low-demand period (cost optimization)
  - id: LOW_DEMAND_OPPORTUNITY
    severity: MEDIUM
    conditions:
      - CURRENT_UTILIZATION < 60%  # Grid has headroom
      - AND weather == MILD  # 60-80°F, no extremes
    operational_impact: "Grid has excess capacity - favorable energy rates"
    recommendation:
      action: "INCREASE_PRODUCTION"
      details:
        - "Schedule energy-intensive processes now"
        - "Grid utilization low ({{UTILIZATION_PERCENT}}%)"
        - "Rates likely favorable due to low demand"
        - "Potential savings: 8-12% vs peak-demand periods"
    confidence: MEDIUM
    timeframe: "Next {{mild_weather_days}} days"

  # CRITICAL: Extreme weather (production risk)
  - id: EXTREME_WEATHER_PRODUCTION_RISK
    severity: HIGH
    conditions:
      - (MAX_TEMP > 105°F OR MIN_TEMP < 10°F)
      - AND state_utilization > 85%
    operational_impact: "Grid stressed - power interruption risk"
    recommendation:
      action: "REDUCE_LOAD"
      details:
        - "Shift production to off-peak hours"
        - "Consider temporary production halt if grid emergency declared"
        - "Backup generators on standby"
        - "Cost of interruption: ${{interruption_cost_estimate}}/hour"
    confidence: HIGH
    timeframe: "Peak risk: {{extreme_weather_window}}"
```

**Output**: `OPERATIONAL_ALERTS[]` - Array of matched rules

---

### STEP 4: Generate Operational Recommendations

For each OPERATIONAL_ALERT:

```yaml
recommendation_generation:
  for each alert in OPERATIONAL_ALERTS:
    if alert.severity >= {{alert_threshold}}:

      # Build recommendation
      recommendation = {
        operation_type: detect_operation(GENERATION_MIX),
        action: alert.recommendation.action,
        severity: alert.severity,
        impact: alert.operational_impact,
        details: alert.recommendation.details,
        confidence: alert.confidence,
        timeframe: alert.timeframe,
        business_value: estimate_value(alert, CAPACITY_DATA),
        weather_driver: alert.id
      }

      RECOMMENDATIONS.append(recommendation)

  # Sort by severity (CRITICAL > HIGH > MEDIUM > LOW)
  RECOMMENDATIONS.sort(severity DESC, confidence DESC)
```

**Auto-detect operation type:**
```javascript
function detect_operation(generation_mix) {
  if (generation_mix.wind > 20%) return "WIND_FARM_OPERATIONS";
  if (generation_mix.solar > 15%) return "SOLAR_FARM_OPERATIONS";
  if (generation_mix.naturalGas > 40%) return "UTILITY_GRID_OPERATIONS";
  return "GENERAL_OPERATIONS";
}
```

**Save as**: `RECOMMENDATIONS[]`

---

## Output Template

**IMPORTANT**: Always output OPERATIONAL DASHBOARD FIRST.

```markdown
# ⚡ Energy Operations Dashboard - {{state}}

**Generated:** {{timestamp}}
**State:** {{state}} ({{state_name}})
**Forecast Period:** {{forecast_days}} days
**Services:** eia-service ✅ + weather-service ✅

---

## 🎯 OPERATIONAL DASHBOARD - Quick View

### Current State Profile

| Metric | Value | Status |
|--------|-------|--------|
| **Total Generation** | {{TOTAL_GENERATION}} TWh/month | — |
| **Primary Fuel** | {{PRIMARY_FUEL}} ({{primary_fuel_percent}}%) | — |
| **Renewable Mix** | Solar {{solar_pct}}% + Wind {{wind_pct}}% = {{RENEWABLE_PERCENT}}% | {{renewable_status}} |
| **Capacity** | {{SUMMER_CAPACITY_GW}} GW (summer) / {{WINTER_CAPACITY_GW}} GW (winter) | — |
| **Utilization** | {{UTILIZATION_PERCENT}}% | {{utilization_status}} |

**Utilization Status**:
- < 60%: ✅ NORMAL (grid has headroom)
- 60-80%: ⚠️ ELEVATED (monitor closely)
- > 80%: 🔴 HIGH (stressed, risk of issues)

**Renewable Status**:
- < 15%: Low (traditional grid)
- 15-30%: Moderate (emerging renewables)
- > 30%: High (significant intermittency management needed)

---

### Weather Forecast Summary

**Current:** {{CURRENT_TEMP}}°F (feels {{CURRENT_FEELS_LIKE}}°F), {{CURRENT_CONDITIONS}}

**{{forecast_days}}-Day Outlook:**

| Day | High | Low | Wind | Conditions | Grid Impact |
|-----|------|-----|------|------------|-------------|
{{#each DAILY_FORECASTS}}
| {{day_num}} | {{tempMax}}°F | {{tempMin}}°F | {{windSpeed}} mph | {{conditions}} | {{grid_impact_emoji}} |
{{/each}}

**Temperature Range:** {{MIN_TEMP}}°F to {{MAX_TEMP}}°F
**Hot Days (>95°F):** {{HOT_DAYS}}
**Cold Days (<32°F):** {{COLD_DAYS}}
**High Wind Days (>20mph):** {{HIGH_WIND_DAYS}}

---

### 🚨 Operational Alerts ({{OPERATIONAL_ALERTS.length}})

{{#each RECOMMENDATIONS}}
| {{severity_emoji}} | **{{action}}** | {{confidence}} confidence | {{timeframe}} |
|---|---|---|---|
| **Impact:** | {{impact}} | | |
| **Business Value:** | {{business_value}} | | |
{{/each}}

{{#if RECOMMENDATIONS.length == 0}}
| ✅ | **NO ALERTS** | Normal operations | Entire period |
|---|---|---|---|
| **Status:** | No weather-driven operational changes needed | | |
{{/if}}

---

## 📋 Detailed Recommendations

{{#each RECOMMENDATIONS}}
### {{index}}. {{action}} - {{severity}} {{severity_emoji}}

**Operational Impact:** {{impact}}

**Recommended Actions:**
{{#each details}}
- {{action_item}}
{{/each}}

**Weather Driver:** {{weather_driver}}
**Confidence:** {{confidence}}
**Timeframe:** {{timeframe}}
**Estimated Value:** {{business_value}}

**Grid Context:**
- Current utilization: {{UTILIZATION_PERCENT}}%
- Available headroom: {{100 - UTILIZATION_PERCENT}}%
- {{PRIMARY_FUEL}} provides {{primary_fuel_percent}}% of generation

---
{{/each}}

{{#if RECOMMENDATIONS.length == 0}}
## ✅ Normal Operations - No Alerts

**Weather Analysis:** {{forecast_days}}-day forecast shows normal conditions for {{state}}.

**Current Status:**
- Temperature range {{MIN_TEMP}}-{{MAX_TEMP}}°F (typical for season)
- No extreme weather events expected
- Grid utilization {{UTILIZATION_PERCENT}}% ({{utilization_status}})

**Recommendation:** Continue normal operations. Re-run analysis in 24-48 hours.

{{/if}}

---

## 📊 Energy Mix Analysis

**{{state}} Current Generation Mix:**

| Fuel Type | Generation (MWh) | Percentage | Weather Sensitivity |
|-----------|------------------|------------|---------------------|
| Natural Gas | {{gas_mwh}} | {{gas_pct}}% | ⚡ Moderate (backup for renewables) |
| Wind | {{wind_mwh}} | {{wind_pct}}% | 🌬️ HIGH (wind speed correlation) |
| Solar | {{solar_mwh}} | {{solar_pct}}% | ☀️ HIGH (cloud cover impact) |
| Coal | {{coal_mwh}} | {{coal_pct}}% | ⚫ Low (baseload, weather-independent) |
| Nuclear | {{nuclear_mwh}} | {{nuclear_pct}}% | ☢️ Low (baseload, weather-independent) |
| Hydro | {{hydro_mwh}} | {{hydro_pct}}% | 💧 Moderate (seasonal/drought) |
| Other | {{other_mwh}} | {{other_pct}}% | — |

**Total Generation:** {{TOTAL_GENERATION}} TWh/month

**Weather Exposure:** {{RENEWABLE_PERCENT}}% of generation is weather-dependent (solar + wind)

---

## 🎯 Cross-Correlation Insights

### What Weather + EIA Data Reveals

{{#if RENEWABLE_PERCENT > 25}}
**High Renewable State** ({{RENEWABLE_PERCENT}}% solar + wind):
- ⚡ **Weather drives {{RENEWABLE_PERCENT}}% of generation**
- ⚡ Forecast accuracy critical for dispatch planning
- ⚡ Backup capacity must match intermittency
- 🎯 Recommendation: Use hourly forecasts for real-time dispatch optimization
{{/if}}

{{#if FUEL_PERCENTAGES.wind > 20}}
**Wind Leader** ({{FUEL_PERCENTAGES.wind}}%):
- 🌬️ Wind speed forecast directly impacts {{wind_mwh}} MWh generation
- 🌬️ 5 mph change = ~{{wind_impact_percent}}% generation change
- 🎯 Recommendation: 7-day wind forecast essential for maintenance planning
{{/if}}

{{#if FUEL_PERCENTAGES.solar > 15}}
**Solar Significant** ({{FUEL_PERCENTAGES.solar}}%):
- ☀️ Cloud cover forecast impacts {{solar_mwh}} MWh generation
- ☀️ Cloudy day = 60-80% generation drop
- 🎯 Recommendation: Hourly forecast for backup dispatch coordination
{{/if}}

{{#if FUEL_PERCENTAGES.naturalGas > 40}}
**Natural Gas Heavy** ({{FUEL_PERCENTAGES.naturalGas}}%):
- ⚡ Temperature extremes drive demand (heating + cooling)
- ⚡ Acts as backup for renewable intermittency
- 🎯 Recommendation: Temperature forecast guides fuel procurement
{{/if}}

---

## 💰 Business Value Estimates

### Potential Savings/Revenue This Period

{{#each RECOMMENDATIONS}}
**{{action}}:**
- Type: {{value_type}} (cost avoidance, revenue preservation, efficiency gain)
- Estimate: {{business_value}}
- Confidence: {{confidence}}
- Basis: {{value_calculation_basis}}

{{/each}}

**Total Potential Value:** ${{total_value_estimate}}

**Calculation Basis:**
- Wind maintenance optimization: 15-25% revenue preservation
- Blackout prevention: $5-10M per avoided event
- Production cost optimization: 8-12% energy savings
- Dispatch efficiency: 20-30% emergency cost reduction

---

## 📈 Historical Weather-Energy Correlations

**{{state}} Specific Examples:**

| Date | Weather Event | Energy Impact | Lesson |
|------|---------------|---------------|--------|
{{#if state == "TX"}}
| Feb 2021 | Multi-day freeze (<10°F) | 30 GW offline, $130B damage | Pre-position reserves for cold snaps |
| Aug 2023 | Heat wave (110°F+) | Peak demand 85 GW (record) | Demand response prevented blackouts |
| Dec 2022 | Winter Storm Uri | Natural gas supply disruption | Weather + fuel logistics = critical |
{{/if}}
{{#if state == "CA"}}
| Aug 2020 | Heat wave + fires | Rolling blackouts | Solar drops evening = backup needed |
| Sep 2022 | Flex Alert success | Heat wave managed without blackouts | Demand response + forecast = success |
{{/if}}
{{#if state == "NY"}}
| Jan 2018 | Bomb cyclone | Peak demand spike | Cold weather = heating load |
{{/if}}

**Key Insight:** Weather forecasting enables proactive operations vs reactive crisis management.

---

## ✅ Recommended Actions (Prioritized)

### Immediate (Next 24 hours):
{{#each RECOMMENDATIONS where timeframe.includes("Day 1")}}
- [ ] {{action}}: {{impact}}
{{/each}}

### Short-term (Days 2-3):
{{#each RECOMMENDATIONS where timeframe.includes("Day 2") OR timeframe.includes("Day 3")}}
- [ ] {{action}}: {{impact}}
{{/each}}

### Medium-term (Days 4-7):
{{#each RECOMMENDATIONS where timeframe.includes("Day 4+")}}
- [ ] {{action}}: {{impact}}
{{/each}}

### Ongoing:
- [ ] Monitor weather forecast updates (run this analysis daily)
- [ ] Track actual vs forecast accuracy
- [ ] Adjust operations based on forecast changes
- [ ] Document cost savings achieved

---

## 🔄 Continuous Improvement

**Recommended Analysis Frequency:**
- **High renewable states** (>25%): Daily (weather drives operations)
- **Moderate renewable** (10-25%): Every 2-3 days
- **Low renewable** (<10%): Weekly (less weather-sensitive)

**What to Monitor:**
- Forecast accuracy (actual temps vs predicted)
- Operational decision outcomes (savings achieved)
- Correlation strength (weather → generation → costs)

**Re-run this analysis:**
- Daily during extreme weather periods
- Every 2-3 days during normal conditions
- Immediately if forecast changes significantly

---

**Disclaimer:** Operational analysis for planning purposes. Weather forecasts have inherent uncertainty. Always maintain safety margins and follow grid operator protocols.

**Prompt Version:** energy_operations_optimizer v1.0
**Services Used:** 2 (eia-service, weather-service)
**Operational Focus:** Cost reduction, blackout prevention, efficiency optimization
```

---

## State-Specific Optimization Rules

### Texas (Wind + Natural Gas Leader)

**Focus**: Wind generation optimization, cold snap preparation

**Key Metrics**:
- Wind: 27% (U.S. leader)
- Natural Gas: 40% (backup + baseload)
- Solar: 10% (growing fast)

**Weather Priorities**:
1. 7-day wind forecast (maintenance planning)
2. Cold snap alerts (<25°F = freeze risk)
3. Heat wave monitoring (>100°F = demand spike)

---

### California (Solar + Renewable Mandate)

**Focus**: Solar intermittency management, heat wave preparation

**Key Metrics**:
- Solar: 23% (leader)
- Natural Gas: 50% (backup)
- Renewables: 32% total

**Weather Priorities**:
1. Hourly cloud cover (solar drop prediction)
2. Heat wave tracking (>95°F = AC load)
3. Wind forecast (desert solar + wind combo)

---

### New York (Nuclear + Diverse Mix)

**Focus**: Demand forecasting, winter preparation

**Key Metrics**:
- Natural Gas: 45%
- Nuclear: 30% (baseload)
- Hydro: 20%

**Weather Priorities**:
1. Cold snap alerts (<20°F = heating load)
2. Summer heat (>90°F = AC demand)
3. Storm tracking (infrastructure risk)

---

### Florida (Summer Peak, Solar Growing)

**Focus**: AC demand management, solar growth

**Key Metrics**:
- Natural Gas: 75% (dominant)
- Solar: 12% (growing 20%/year)
- Renewables: 15%

**Weather Priorities**:
1. Heat/humidity tracking (heat index >100 = peak AC)
2. Hurricane monitoring (infrastructure risk)
3. Solar forecast (cloud cover impacts)

---

## Usage Examples

```bash
# Default: Texas wind + grid optimization
/prompt energy_operations_optimizer

# California solar operations
/prompt energy_operations_optimizer state="CA"

# New York winter operations (7-day forecast)
/prompt energy_operations_optimizer state="NY" forecast_days=7

# High sensitivity (all alerts)
/prompt energy_operations_optimizer alert_threshold="LOW"

# Wind farm specific (Texas)
/prompt energy_operations_optimizer state="TX" operation_type="wind_farm"

# Manufacturing facility planning
/prompt energy_operations_optimizer state="OK" operation_type="manufacturing"
```

---

## Appendix: Confidence Scoring

| Confidence | Criteria | Operational Risk |
|------------|----------|------------------|
| **HIGH** | Strong weather-energy correlation + Clear forecast pattern + <3 day timeframe | Low risk - high confidence decision |
| **MEDIUM** | Moderate correlation + Developing pattern + 3-5 day timeframe | Moderate risk - monitor closely |
| **LOW** | Weak correlation + Uncertain pattern + >5 day timeframe | High uncertainty - standby mode |

---

## Tags

`#mcp` `#cross-service` `#operations` `#energy` `#eia` `#weather` `#grid-optimization` `#renewable-integration` `#cost-reduction` `#predictive-analytics`
