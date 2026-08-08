import type { Continent } from './location-types'

const CONTINENT_CODES: Readonly<Record<Continent, readonly string[]>> = {
  Africa: words('DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW'),
  Antarctica: words('AQ BV HM TF GS'),
  Asia: words('AF AM AZ BH BD BT IO BN KH CN CX CC CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE'),
  Europe: words('AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG VA HU IS IE IM IT JE LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB'),
  'North America': words('AI AG AW BS BB BZ BM BQ CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX TT TC US VI'),
  Oceania: words('AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV UM VU WF'),
  'South America': words('AR BO BR CL CO EC FK GF GY PY PE SR UY VE'),
}

const CODE_TO_CONTINENT = new Map<string, Continent>()
for (const [continent, codes] of Object.entries(CONTINENT_CODES) as [Continent, string[]][]) {
  for (const code of codes) {
    if (CODE_TO_CONTINENT.has(code)) {
      throw new Error(`Duplicate country or territory code: ${code}`)
    }
    CODE_TO_CONTINENT.set(code, continent)
  }
}

export function continentForCountryCode(code: string | null): Continent | null {
  return code ? CODE_TO_CONTINENT.get(code) ?? null : null
}

function words(value: string): string[] {
  return value.split(' ')
}
