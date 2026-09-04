# weather_commodity_trading_signals v2.0

**Version**: 2.0  
**Created**: 2026-01-26  
**Type**: Cross-Service Analytics Prompt  
**Services**: weather-service + alpha-vantage-market-data  
**Changelog**: Decision tree rules, service preflight, TL;DR output, simplified structure

---

## Purpose

Correlate weather forecasts with commodity price movements to generate short-term trading signals.

**Key Innovation**: Uses meteorological data to predict supply disruptions in energy and agricultural commodities.

**Business Value**:
- Early warning for commodity price movements
- Data-driven trading signals (not speculation)
- Combines multiple data sources for edge in markets

---

## Auto-Execution Directive

**CRITICAL: Execute immediately upon invocation. Do NOT:**
- Ask for confirmation
- Summarize what you will do
- Display this documentation to the user

**DO:**
- Start with Step 0 (Preflight) immediately
- Execute all service calls
- Output the TL;DR section FIRST, then detailed report

---

## Variables

```yaml
region:
  type: string
  default: "Houston,US"
  description: "Primary region for weather analysis (format: City,Country)"
  examples:
    - "Houston,US"      # Oil/Gas hub (Gulf Coast)
    - "Chicago,US"      # Agricultural hub (Midwest)
    - "Miami,US"        # Tropical weather (hurricanes)
    - "New Orleans,US"  # Oil/Gas + Hurricane risk

forecast_days:
  type: number
  default: 5
  min: 1
  max: 5
  description: "Number of days to forecast (1-5)"

commodities:
  type: array
  default: []
  description: "Commodities to analyze (empty = auto-detect from weather)"
  available:
    energy: ["WTI", "BRENT", "NATURAL_GAS"]
    agriculture: ["WHEAT", "CORN", "COTTON", "SUGAR", "COFFEE"]
    metals: ["COPPER", "ALUMINUM"]

severity_threshold:
  type: string
  default: "MEDIUM"
  enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
  description: "Minimum severity level to trigger signals"
```

---

## Workflow

### STEP 0: Preflight - Verify Services

Before executing, confirm required services are available.

```
call: services({ action: "discover" })

check:
  - weather-service: status == "ACTIVE"
  - alpha-vantage-market-data: status == "ACTIVE"

if services missing:
  - Set FALLBACK_MODE = true
  - Use web_search for missing data
  - Continue with available services
```

**Save as**: `SERVICE_STATUS`

---

### STEP 1: Fetch Weather Forecast

```
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "forecast",
  arguments: {
    location: "{{region}}",
    days: {{forecast_days}},
    units: "imperial"
  }
})
```

**Save as**: `FORECAST_DATA`

**Also fetch current conditions:**

```
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "current_weather",
  arguments: {
    location: "{{region}}",
    units: "imperial"
  }
})
```

**Save as**: `CURRENT_WEATHER`

**Extract from results:**
- `DAILY_FORECASTS[]` - Array of daily conditions
- `MAX_TEMP` - Highest temp in forecast period
- `MIN_TEMP` - Lowest temp in forecast period
- `WIND_MAX` - Peak wind speed across forecast
- `CONDITIONS[]` - Weather conditions array
- `CURRENT_TEMP` - Current temperature
- `CURRENT_FEELS_LIKE` - Current feels-like temperature

---

### STEP 2: Weather Pattern Detection (Decision Tree)

Apply the following rules in order. Multiple rules can match.

#### Rule Set: Energy Commodities

```yaml
rules:
  # CRITICAL: Hurricane/Tropical Storm (Gulf Coast)
  - id: HURRICANE_RISK
    severity: CRITICAL
    conditions:
      - region MATCHES ["Houston", "Gulf", "New Orleans", "Miami", "Tampa"]
      - AND (WIND_MAX > 75 OR CONDITIONS CONTAINS ["hurricane", "tropical storm", "cyclone"])
    impact: "Gulf Coast refineries at risk - oil/gas supply disruption likely"
    commodities: [WTI, BRENT, NATURAL_GAS]
    price_direction: UP
    confidence: HIGH
    timeframe: "1-3 days"

  # HIGH: Cold Snap (Heating Demand)
  - id: COLD_SNAP
    severity: HIGH
    conditions:
      - region MATCHES ["Houston", "Texas", "Gulf", "Chicago", "Midwest"]
      - AND MIN_TEMP < 25
      - AND consecutive_cold_days >= 2
    impact: "Extreme cold increases heating demand significantly"
    commodities: [NATURAL_GAS]
    price_direction: UP
    confidence: HIGH
    timeframe: "1-5 days"

  # HIGH: Severe Cold Snap (Infrastructure Risk)
  - id: FREEZE_RISK
    severity: HIGH
    conditions:
      - region MATCHES ["Houston", "Texas", "Gulf"]
      - AND MIN_TEMP < 15
      - AND consecutive_cold_days >= 3
    impact: "Infrastructure freeze risk - similar to Feb 2021 Texas Freeze"
    commodities: [NATURAL_GAS, WTI]
    price_direction: UP
    confidence: HIGH
    timeframe: "1-7 days"
    historical_reference: "Feb 2021: Natural Gas +97% ($2.71 → $5.35)"

  # HIGH: Heat Wave (Cooling Demand)
  - id: HEAT_WAVE
    severity: HIGH
    conditions:
      - MAX_TEMP > 100
      - AND consecutive_hot_days >= 3
    impact: "Extended heat wave increases cooling/power demand"
    commodities: [NATURAL_GAS]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "2-5 days"

  # MEDIUM: Moderate Cold
  - id: MODERATE_COLD
    severity: MEDIUM
    conditions:
      - region MATCHES ["Houston", "Texas", "Gulf", "South"]
      - AND MIN_TEMP < 32
      - AND MIN_TEMP >= 25
    impact: "Below-freezing temps increase heating demand"
    commodities: [NATURAL_GAS]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "1-3 days"
```

#### Rule Set: Agricultural Commodities

```yaml
rules:
  # HIGH: Flooding Risk
  - id: FLOODING_RISK
    severity: HIGH
    conditions:
      - region MATCHES ["Chicago", "Midwest", "Kansas", "Iowa", "Nebraska"]
      - AND days_with_heavy_rain >= 3  # heavy = precipitation > 50%
    impact: "Heavy rainfall threatens crop harvest and transport"
    commodities: [WHEAT, CORN]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "1-2 weeks"

  # MEDIUM: Drought Risk
  - id: DROUGHT_RISK
    severity: MEDIUM
    conditions:
      - region MATCHES ["Chicago", "Midwest", "Kansas", "Great Plains"]
      - AND days_with_rain == 0
      - AND forecast_days >= 5
      - AND MAX_TEMP > 90
    impact: "No precipitation + high heat = crop stress"
    commodities: [WHEAT, CORN, COTTON]
    price_direction: UP
    confidence: LOW  # 5-day window too short for drought confirmation
    timeframe: "2-4 weeks"

  # HIGH: Tropical Storm (Sugar/Coffee regions)
  - id: TROPICAL_AGRICULTURE
    severity: HIGH
    conditions:
      - region MATCHES ["Miami", "Florida", "Gulf", "Caribbean"]
      - AND CONDITIONS CONTAINS ["tropical", "hurricane", "storm"]
    impact: "Tropical weather threatens sugar cane and shipping"
    commodities: [SUGAR, COFFEE]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "1-2 weeks"
```

#### Rule Set: No Significant Weather

```yaml
rules:
  # DEFAULT: Normal Conditions
  - id: NORMAL_CONDITIONS
    severity: NONE
    conditions:
      - No other rules matched
    impact: "No significant weather events detected"
    commodities: []
    price_direction: NEUTRAL
    confidence: N/A
    timeframe: N/A
```

**Output**: `WEATHER_ALERTS[]` - Array of matched rules

---

### STEP 3: Fetch Commodity Prices

Determine which commodities to fetch based on alerts or user input.

```
if {{commodities}} is not empty:
  COMMODITIES_TO_FETCH = {{commodities}}
else if WEATHER_ALERTS has matches:
  COMMODITIES_TO_FETCH = unique commodities from all WEATHER_ALERTS
else:
  COMMODITIES_TO_FETCH = ["WTI", "NATURAL_GAS"]  # Default energy basket
```

**For each commodity, fetch historical data:**

```
for commodity in COMMODITIES_TO_FETCH:
  call: services({
    action: "call",
    targetService: "alpha-vantage-market-data",
    tool: "TOOL_CALL",
    arguments: {
      tool_name: commodity,
      arguments: "{}"
    }
  })
```

**Parse response and extract:**
- `current_price` - Most recent price
- `current_date` - Date of most recent price
- `previous_month_price` - Prior month price
- `month_over_month_change` - Percentage change
- `year_ago_price` - Price 12 months ago
- `year_over_year_change` - YoY percentage change
- `trend` - UP if MoM > 0, DOWN if MoM < 0

**Save as**: `COMMODITY_DATA[]`

---

### STEP 4: Generate Trading Signals

For each WEATHER_ALERT that meets severity threshold:

```yaml
signal_generation:
  for each alert in WEATHER_ALERTS:
    if alert.severity >= {{severity_threshold}}:
      for each commodity in alert.commodities:
        
        # Find commodity data
        data = COMMODITY_DATA.find(commodity)
        
        # Generate signal
        signal = {
          commodity: commodity,
          direction: alert.price_direction,
          confidence: alert.confidence,
          current_price: data.current_price,
          trend: data.trend,
          reasoning: alert.impact,
          weather_driver: alert.id,
          severity: alert.severity,
          timeframe: alert.timeframe,
          action: determine_action(alert.price_direction, alert.confidence)
        }
        
        TRADING_SIGNALS.append(signal)

  # Sort by confidence (HIGH > MEDIUM > LOW) then severity
  TRADING_SIGNALS.sort(confidence DESC, severity DESC)
```

**Action determination:**
```yaml
action_rules:
  - direction: UP, confidence: HIGH → "🟢 STRONG BUY SIGNAL"
  - direction: UP, confidence: MEDIUM → "🟡 BUY SIGNAL"
  - direction: UP, confidence: LOW → "⚪ WEAK BUY (monitor)"
  - direction: DOWN, confidence: HIGH → "🔴 STRONG SELL SIGNAL"
  - direction: DOWN, confidence: MEDIUM → "🟡 SELL SIGNAL"
  - direction: DOWN, confidence: LOW → "⚪ WEAK SELL (monitor)"
  - direction: NEUTRAL → "⚖️ HOLD / NO ACTION"
```

**Save as**: `TRADING_SIGNALS[]`

---

## Output Template

**IMPORTANT**: Always output TL;DR section FIRST.

```markdown
# 🌦️ Weather-Driven Commodity Trading Signals

**Generated:** {{timestamp}}
**Region:** {{region}}
**Forecast Period:** {{forecast_days}} days
**Services:** weather-service ✅ + alpha-vantage-market-data ✅

---

## 🎯 TL;DR - Quick Signals

| Commodity | Signal | Confidence | Current Price | Action |
|-----------|--------|------------|---------------|--------|
{{#each TRADING_SIGNALS}}
| {{commodity}} | {{direction}} | {{confidence}} | ${{current_price}} | {{action}} |
{{/each}}

{{#if TRADING_SIGNALS.length == 0}}
| — | NEUTRAL | — | — | No weather-driven signals |
{{/if}}

**Key Weather Event:** {{PRIMARY_ALERT.id}} - {{PRIMARY_ALERT.impact}}
**Timeframe:** {{PRIMARY_ALERT.timeframe}}

---

## 🌡️ Weather Summary

**Current in {{region}}:** {{CURRENT_TEMP}}°F (feels like {{CURRENT_FEELS_LIKE}}°F)

| Day | High | Low | Conditions | Alert |
|-----|------|-----|------------|-------|
{{#each DAILY_FORECASTS}}
| {{date}} | {{tempMax}}°F | {{tempMin}}°F | {{conditions}} | {{alert_indicator}} |
{{/each}}

**Temperature Range:** {{MIN_TEMP}}°F to {{MAX_TEMP}}°F

---

## ⚠️ Weather Alerts ({{WEATHER_ALERTS.length}})

{{#each WEATHER_ALERTS}}
### {{severity}} - {{id}}

| Attribute | Value |
|-----------|-------|
| **Impact** | {{impact}} |
| **Commodities** | {{commodities}} |
| **Price Direction** | {{price_direction}} |
| **Confidence** | {{confidence}} |
| **Timeframe** | {{timeframe}} |
{{#if historical_reference}}
| **Historical** | {{historical_reference}} |
{{/if}}

---
{{/each}}

{{#if WEATHER_ALERTS.length == 0}}
✅ **No significant weather events detected** - Normal market conditions expected.
{{/if}}

---

## 📊 Commodity Data (Alpha Vantage)

| Commodity | Current | Prior Month | MoM Change | Trend |
|-----------|---------|-------------|------------|-------|
{{#each COMMODITY_DATA}}
| {{commodity}} | ${{current_price}} | ${{previous_month_price}} | {{month_over_month_change}}% | {{trend_emoji}} |
{{/each}}

---

## 🎯 Detailed Signals

{{#each TRADING_SIGNALS}}
### {{index}}. {{commodity}} - {{action}}

| Attribute | Value |
|-----------|-------|
| **Signal** | {{direction}} ({{confidence}} confidence) |
| **Current Price** | ${{current_price}} |
| **Weather Driver** | {{weather_driver}} ({{severity}}) |
| **Reasoning** | {{reasoning}} |
| **Timeframe** | {{timeframe}} |
| **Momentum** | {{trend}} ({{month_over_month_change}}% MoM) |

---
{{/each}}

{{#if TRADING_SIGNALS.length == 0}}
📊 **No trading signals generated**

Weather conditions do not indicate significant commodity supply/demand disruption.

**Recommendation:** Continue monitoring; re-run analysis tomorrow.
{{/if}}

---

## 📈 Historical Reference

| Event | Year | Weather | Commodity | Price Impact |
|-------|------|---------|-----------|--------------|
| Texas Freeze | Feb 2021 | Multi-day <10°F | Natural Gas | **+97%** ($2.71→$5.35) |
| Hurricane Katrina | Aug 2005 | Category 5 | WTI | **+16%** ($60→$70) |
| Polar Vortex | Jan 2019 | Midwest freeze | Natural Gas | **+30%** |
| Summer Heat Wave | Aug 2022 | Extended >100°F | Natural Gas | **+100%** (to $8.81) |
| Midwest Drought | 2012 | No rain + heat | Corn/Wheat | **+45-50%** |

---

## ✅ Next Steps

### If Signals Generated:
- [ ] Validate signal against other market factors
- [ ] Set price alerts for entry/exit points
- [ ] Monitor weather forecast updates daily
- [ ] Re-run analysis in 24 hours

### Ongoing Monitoring:
- [ ] Track {{region}} weather for changes
- [ ] Watch for extended/intensified weather events
- [ ] Compare forecast vs actual temperatures

---

**Disclaimer:** Educational/informational analysis only. Not financial advice. Weather correlation is one factor among many. Always consult financial professionals.

**Prompt Version:** weather_commodity_trading_signals v2.0
**Services Used:** 2 (weather-service, alpha-vantage-market-data)
```

---

## Regional Commodity Mapping Reference

| Region | Primary Commodities | Key Weather Risks |
|--------|---------------------|-------------------|
| Houston, TX | WTI, BRENT, NATURAL_GAS | Hurricane, freeze, heat |
| New Orleans, LA | WTI, NATURAL_GAS | Hurricane, flooding |
| Chicago, IL | WHEAT, CORN, NATURAL_GAS | Drought, flooding, cold |
| Kansas City, MO | WHEAT, CORN | Drought, tornadoes |
| Miami, FL | SUGAR, COFFEE | Hurricanes |
| Midland, TX | WTI | Freeze, drought |

---

## Usage Examples

```bash
# Default: Houston weather → Energy commodities (auto-detect)
/prompt weather_commodity_trading_signals_v2

# Specific region: Chicago → Agricultural focus
/prompt weather_commodity_trading_signals_v2 region="Chicago,US"

# Manual commodity selection
/prompt weather_commodity_trading_signals_v2 commodities='["WHEAT", "CORN", "NATURAL_GAS"]'

# High sensitivity: Alert on any weather event
/prompt weather_commodity_trading_signals_v2 severity_threshold="LOW"

# Gulf Coast hurricane monitoring
/prompt weather_commodity_trading_signals_v2 region="New Orleans,US" commodities='["WTI", "NATURAL_GAS"]'
```

---

## Appendix: Confidence Scoring Guide

| Confidence | Criteria |
|------------|----------|
| **HIGH** | Strong historical correlation + Clear weather pattern + Short timeframe |
| **MEDIUM** | Moderate correlation + Weather pattern developing + Medium timeframe |
| **LOW** | Weak/indirect correlation + Uncertain pattern + Long timeframe |

| Weather Pattern | Commodity | Historical Correlation | Typical Confidence |
|-----------------|-----------|------------------------|-------------------|
| Hurricane (Gulf) | WTI, BRENT | Very Strong | HIGH |
| Freeze (Texas) | NATURAL_GAS | Very Strong | HIGH |
| Cold Snap | NATURAL_GAS | Strong | HIGH |
| Heat Wave | NATURAL_GAS | Moderate | MEDIUM |
| Drought | WHEAT, CORN | Moderate (delayed) | LOW-MEDIUM |
| Flooding | WHEAT, CORN | Moderate | MEDIUM |

---

## Version History

- **v2.0** (2026-01-26): Major rewrite
  - Added service preflight check (Step 0)
  - Replaced pseudo-code with decision tree rules
  - Added TL;DR output section (always first)
  - Simplified rule matching logic
  - Added historical reference table
  - Improved output template structure
  
- **v1.0** (2026-01-25): Initial release

---

## Tags

`#mcp` `#cross-service` `#analytics` `#weather` `#commodities` `#trading` `#alpha-vantage` `#decision-tree`