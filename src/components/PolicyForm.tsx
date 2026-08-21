import React, { useState } from 'react';

// ---------- Data definitions ----------

const DISASTER_FIELDS = [
  { key: 'severeStorms', label: 'Severe storms' },
  { key: 'floods', label: 'Floods' },
  { key: 'bushfiresWildfires', label: 'Bushfires/wildfires' },
  { key: 'heatwaves', label: 'Heatwaves' },
  { key: 'extremeCold', label: 'Extreme cold' },
  { key: 'typhoons', label: 'Typhoons' },
  { key: 'hurricanes', label: 'Hurricanes' },
  { key: 'cyclones', label: 'Cyclones' },
  { key: 'earthquakes', label: 'Earthquakes' },
] as const;

// null means "no Yes/No headings for this measure" (first 4 of integrated planning).
// yesLabel / noLabel are the full col-B text that will be written to the xlsx.
export interface PrincipleGroup {
  yesLabel: string | null;    // null = no Yes section
  yesPrinciples: string[];    // predefined principles under Yes
  noLabel: string | null;     // null = no No section
  noPrinciples: string[];     // predefined principles under No
}

// Keyed by exact measure name.
export const MEASURE_PRINCIPLES: Record<string, PrincipleGroup> = {
  // ── Integrated city planning ─────────────────────────────────────
  'Transport and planning combined in one government department': {
    yesLabel: null, yesPrinciples: [], noLabel: null, noPrinciples: [],
  },
  "Transport policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)": {
    yesLabel: null, yesPrinciples: [], noLabel: null, noPrinciples: [],
  },
  "Urban policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)": {
    yesLabel: null, yesPrinciples: [], noLabel: null, noPrinciples: [],
  },
  'Health Impact Assessment (i.e., evaluating potential impacts of policies/plans on population health) requirements in urban/transport policy or legislation': {
    yesLabel: null, yesPrinciples: [], noLabel: null, noPrinciples: [],
  },
  'Urban and/or transport policy explicitly aims for integrated city planning': {
    yesLabel: 'Yes, explicit mention of:',
    yesPrinciples: [
      'Aim for integrated city planning across multiple government departments/agencies',
      'Aim for integration/alignment of transport and land use policy',
      'Policy referral mechanisms/requirements that land use and transport departments both provide input into policy',
    ],
    noLabel: null, noPrinciples: [],
  },
  'Publicly available information on government expenditure for different transport modes': {
    yesLabel: 'Yes, priority investment in public and active transport',
    yesPrinciples: [
      'Greater government investment in public/active transport than car transport infrastructure',
      'Increasing government investment in public/active transport relative to car transport',
    ],
    noLabel: 'No, priority investment in car use',
    noPrinciples: [
      'Greater government investment in car transport than public/active transport',
      'Decreasing or maintaining relatively low investment in active/public transport relative to car transport',
    ],
  },
  // ── Walkability ──────────────────────────────────────────────────
  'Walking participation': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Aim to increase or maintain high levels of walking for transport (e.g., increase walking mode share)',
      'Aim to increase or maintain high levels of walking for recreation (e.g., increase the frequency of recreational walking)',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Aim to decrease or maintain low levels of walking for transport (e.g., maintain or decrease walking mode share)',
      'Aim to decrease or maintain low levels of walking for recreation (e.g., maintain or decrease the frequency of recreational walking)',
    ],
  },
  'Pedestrian infrastructure': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Provision of safe footpaths/pavements/pedestrian routes',
      'Provision of safe pedestrian crossings',
      'Establishment of pedestrianised zones',
      'Provision of pedestrian infrastructure that is accessible for people with a disability',
      'Establishment of weather-sensitive routes through the city (e.g., cool routes, wind tunnel prevention, snow melting etc.)',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Pedestrian infrastructure provision plans are unsafe or inadequate to support walkability',
    ],
  },
  'Cycling participation': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Aim to increase or maintain high levels of cycling for transport (e.g., increase cycling mode share)',
      'Aim to increase or maintain high levels of recreational cycling participation (e.g., increase the frequency of cycling)',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Aim to decrease or maintain low levels of cycling for transport (e.g., maintain or decrease cycling mode share)',
      'Aim to decrease or maintain low levels of recreational cycling participation (e.g., maintain or decrease the frequency of recreational cycling)',
    ],
  },
  'Cycling infrastructure': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Provision of safe cycle paths/lanes/routes (e.g., separated from motorised vehicle traffic or routing of bicycles on low-traffic streets)',
      'Provision of safe bicycle crossings',
      'End-of-trip parking and other facilities required',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Cycling infrastructure provision plans are unsafe or inadequate to encourage cycling',
    ],
  },
  'Traffic safety': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Reduced vehicular speed limits',
      'Intersection control measures',
      'Measures to slow traffic speeds or reduce through-traffic (i.e. traffic calming)',
      'Planning for car-free streets',
      'Planning for low traffic neighbourhoods',
      'Requirement to separate different transport modes (e.g., bicycles separated from cars and sidewalks for pedestrians)',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Prioritisation of motor vehicle mobility',
      'Little/no requirement to separate different transport modes (e.g., bicycles separated from cars)',
    ],
  },
  'Parking restrictions to discourage car use': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Maximum car parking requirements in new developments that discourage car ownership/use',
      'Short time restrictions on parking',
      'Reducing the amount of parking/eliminating parking minimums',
      'Car park pricing mechanisms to discourage driving',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Minimum requirements for car parking provision in new developments that do not discourage car ownership/use',
      'Increasing car parking provision',
      'Providing low cost parking options',
      'Few/no time restrictions on parking',
    ],
  },
  'Street connectivity': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Ped-shed (i.e. ratio of straight line distance buffer to street network distance buffer) requirements for street connectivity to support walking',
      'Required maximum size of street blocks creates connectivity that supports walking',
      'Required minimum number of street intersections per area creates street connectivity that supports walking',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Ped-shed ratio (i.e. ratio of straight line distance buffer to street network distance buffer) requirements do not promote good street connectivity',
      'Street block size requirements are too large for good street connectivity',
      'Requirements for street intersection density make street connectivity too low for walkability',
    ],
  },
  'Housing or population density': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Minimum housing/population density required city-wide that will promote walkability',
      'Minimum housing/population density required close to public transport and/or town centres that will promote walkability',
      'Minimum housing provision/density near jobs that will promote walkability',
      'Maximum housing/population density limits to prevent overcrowding',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Housing/population density requirements would negatively impact walkability',
    ],
  },
  'Residential building heights': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Minimum residential building height requirements that will facilitate adequate population density to support walkability',
      'Maximum residential building height requirements to prevent overcrowding',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Residential building height restrictions do not facilitate adequate density for walkability',
    ],
  },
  'Limits on greenfield housing development': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Fixed urban growth boundary to limit suburban expansion',
      'Most new development planned to occur in unused/underutilised land within an existing urban area (i.e., infill or non-greenfield areas)',
      'Infill development required in established areas',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Large proportion/amount of new development planned to occur in new greenfield sites',
    ],
  },
  'Mixture of housing types/sizes': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Minimum requirements for diverse housing types/sizes to meet diverse population needs (e.g., people across the life span, families, small households, lower income, etc.)',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Restrictions on housing types/sizes limit housing diversity',
    ],
  },
  'Mixture of local destinations for daily living': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Policy to create neighbourhoods or cities where routine activities are only a short walkable trip from homes (e.g. 20 minutes or less)',
      'Explicit policy aim to create liveable cities/neighbourhoods',
      'Requirements or incentives for mixed land use urban development prioritised close to public transport (i.e. transit oriented development)',
      'Policy to create complete neighbourhoods with housing and services',
      "Smaller sized shops/stores on main streets required, rather than 'big box' shopping centres/malls",
    ],
    noLabel: 'No',
    noPrinciples: [
      'Land use zoning encourages single land uses/separation of housing from daily living destinations',
      'Big box shopping centres/malls prioritised over smaller sized shops/stores on main streets',
    ],
  },
  'Close distance to daily living destinations': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirements for nearby access to major/general food stores',
      'Requirements for nearby access to schools',
      'Requirement for short distances to, or between, routine activities',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Distance requirements to food stores/schools/other routine destinations do not support walkable access',
    ],
  },
  'Healthy food environments': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirements for nearby access to fresh food stores',
      'Requirements for provision of, or access to, community gardens',
      "Restrictions on the density of fast food or 'junk' food stores",
      'Bans/restrictions on locating fast food outlets near schools or other key land uses',
      'Required ratio of healthy food stores to all food stores supports healthy food access',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Requirements/provisions for location/density of fresh food stores are inadequate to ensure easy access',
      'Requirements/restrictions on location/density of fast food outlets are inadequate to limit access',
      'Required ratio of healthy food stores to all food stores does not prioritise healthy food access',
    ],
  },
  'Crime prevention through environmental design': {
    yesLabel: 'Yes',
    yesPrinciples: [
      "Streets required to be designed to promote natural surveillance/ 'eyes on the street'",
      'Houses, shops and other buildings are required to be designed to overlook streets and open spaces',
      'Houses, shops and other buildings are required to be designed to overlook public transport stops',
      'Neighbourhoods are required to be designed so that buildings and streets overlook public open spaces',
      'Appropriate levels and types of lighting are required in public spaces',
      'Buildings, landscaping and parks are required to be well maintained',
    ],
    noLabel: 'No',
    noPrinciples: [
      "Streets, open space or buildings not required to be designed or positioned to promote natural surveillance/ 'eyes on the street'",
    ],
  },
  'Employment distribution': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirement for decentralised employment',
      'Requirement for employment/activity centres to be distributed throughout the city',
      'Required minimum number of jobs per area/zone',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Requirement for centralised employment/activity centres',
      'Requirement for too few jobs per area/zone',
    ],
  },
  'Ratio of jobs to housing': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirement for balanced ratio of jobs to housing, to support well-distributed employment across the city',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Ratio of jobs to housing does not support well-distributed employment',
    ],
  },
  // ── Public transport ─────────────────────────────────────────────
  'Access to employment and services via public transport': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirement for public transport trip durations to employment/key services that facilitate access',
      'Requirement for public transport trip distances to employment/key services that facilitate access',
      'Requirement to co-locate public transport and employment/services.',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Requirement for public transport trip times or distances to employment/key services that do not promote easy access',
    ],
  },
  'Public transport access': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Minimum distance/nearby access requirements to public transport stops, to promote walking',
      'Requirement for access to frequent public transport',
      'Requirement for access to rapid/high speed public transport',
      'Adding new routes for underserved populations.',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Distance to public transport stop requirements do not support walkable access',
      'Requirement for low public transport frequencies that discourage usage',
      'Requirement for low public transport speeds that discourage usage',
    ],
  },
  'Public transport use': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Aim to increase or maintain high level of public transport use or mode share',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Aim to decrease or maintain low levels of public transport use or mode share',
    ],
  },
  // ── Public open space ────────────────────────────────────────────
  'Public open space access': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Minimum requirements for distance/nearby access to parks or public open space (any kind)',
      'Minimum requirements for distance/nearby access to green space',
      'Size requirements for parks or public open space (any kind) to promote walking/usage',
      'Size requirements for green space to promote walking/usage',
      'Increase or maintain an adequate amount of parkland or public open space per population/dwelling/land area',
      'Increase or maintain an adequate amount of green space per population/dwelling/land area',
      'Requirements for quality of parks or other public open space',
      'Provide new parks, public open spaces or green spaces in underserved areas',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Distance to parks/public open space/green space requirements do not support walkable access',
      'Size requirements for parks/public open space/green space do not promote walking/usage',
      'Inadequate amount of parkland/public open space/green space required per population/dwelling/land area',
    ],
  },
  // ── Nature-based solutions ───────────────────────────────────────
  'Tree canopy and urban greening': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirement to increase/maintain a high proportion of tree canopy cover',
      'Requirement to increase/maintain a high level of vegetation/green infrastructure',
      'Requirement to increase/protect urban forests/plant new trees',
      'Requirement to create/maintain green corridors',
      'Retention of trees/vegetation in new development sites',
      'Requirement to implement nature-based solutions that protect or restore ecosystems, supporting biodiversity and human wellbeing',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Policies/development controls discourage or work against increasing or protecting trees and urban greening',
    ],
  },
  'Urban biodiversity protection & promotion': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirement to increase/protect urban biodiversity/species diversity/habitat',
      'Requirement to reduce habitat fragmentation or increase/maintain habitat connectivity',
      'Requirement to use biodiversity sensitive design',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Policies/development controls discourage or work against increasing or protecting biodiversity/species diversity/habitat',
      'Policies/development controls discourage or work against reducing habitat fragmentation/increasing habitat connectivity',
    ],
  },
  // ── Urban air quality ────────────────────────────────────────────
  'Transport policies to limit air pollution': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Limiting motorised vehicle traffic in residential/school areas to reduce air pollution exposure',
      'Limiting motorised vehicle traffic or speeds in areas of high air pollution',
      'Planning for low transport emissions zones',
      'Policies related to vehicle age/type, or fuel type to reduce pollution/emissions',
      'Policies actively encouraging transition to electric vehicles and/or discouraging fossil fuel vehicles',
      'Promotion of car sharing',
      'Motorists are charged a fee to drive in areas with high traffic (i.e., congestion charging)',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Policy that could increase transport-related air pollution',
      'Policy that increases road traffic',
      'Policy that increases truck/freight traffic',
    ],
  },
  'Land use policies to reduce air pollution exposure': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'Requirement to locate high density housing and/or schools away from busy roads',
      'Limiting industrial pollution in residential areas (e.g., buffer distances)',
      'Regulated limits on levels of air pollution/emissions from industry',
      'Housing design guidelines to reduce exposure to air pollution',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Land use policy that could increase air pollution exposure',
    ],
  },
  // ── Climate disaster ─────────────────────────────────────────────
  'Adaptation and disaster risk reduction': {
    yesLabel: 'Yes',
    yesPrinciples: [
      'New development banned or significantly restricted in areas at high risk from climate change-related disasters (e.g., flood, fire or coastal inundation prone areas)',
      'Buildings and/or built environment features required to be designed to reduce impacts of climate change-related disasters such as …',
      '… flooding',
      '… bushfire/wildfire',
      '… severe storms',
      '… landslides',
      '… urban heat',
      '… extreme cold',
    ],
    noLabel: 'No',
    noPrinciples: [
      'Development allowed in areas at high risk from climate change-related disasters (e.g., flood, fire or coastal inundation prone areas)',
      'Urban infrastructure and transport inadequately planned/controlled to withstand climate change-related disaster risks',
    ],
  },
};

const GHSCI_INDICATORS: Record<string, string[]> = {
  'Integrated city planning policies for health and sustainability': [
    'Transport and planning combined in one government department',
    "Transport policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)",
    "Urban policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)",
    'Health Impact Assessment (i.e., evaluating potential impacts of policies/plans on population health) requirements in urban/transport policy or legislation',
    'Urban and/or transport policy explicitly aims for integrated city planning',
    'Publicly available information on government expenditure for different transport modes',
  ],
  'Walkability and destination access policies': [
    'Walking participation',
    'Pedestrian infrastructure',
    'Cycling participation',
    'Cycling infrastructure',
    'Traffic safety',
    'Parking restrictions to discourage car use',
    'Street connectivity',
    'Housing or population density',
    'Residential building heights',
    'Limits on greenfield housing development',
    'Mixture of housing types/sizes',
    'Mixture of local destinations for daily living',
    'Close distance to daily living destinations',
    'Healthy food environments',
    'Crime prevention through environmental design',
    'Employment distribution',
    'Ratio of jobs to housing',
  ],
  'Public transport policies': [
    'Access to employment and services via public transport',
    'Public transport access',
    'Public transport use',
  ],
  'Public open space policies': [
    'Public open space access',
  ],
  'Nature-based solutions policies': [
    'Tree canopy and urban greening',
    'Urban biodiversity protection & promotion',
  ],
  'Urban air quality policies': [
    'Transport policies to limit air pollution',
    'Land use policies to reduce air pollution exposure',
  ],
  'Climate disaster risk reduction policies': [
    'Adaptation and disaster risk reduction',
  ],
};

// ---------- Types ----------

export interface PolicyEntry {
  policy: string;
  levelOfGovernment: string;
  adoptionDate: string;
  citation: string;
  text: string;
  mandatory: string;
  measurableTarget: string;
  measurableTargetText: string;
  evidenceInformedThreshold: string;
  thresholdExplanation: string;
  notes: string;
  saved: boolean;
}

// A single principle (Yes or No aligned) with 0..n associated policies.
export interface PrincipleEntry {
  principle: string;      // The principle text (predefined or user-supplied "Other")
  isOther: boolean;       // true = user typed their own principle label
  qualifier: 'Yes' | 'No';
  entries: PolicyEntry[]; // Policies associated with this principle
}

// Per-measure state. For measures with no Yes/No headings (first 4 of integrated planning),
// principles is empty and we fall back to a flat entries list.
export interface MeasureData {
  principles: PrincipleEntry[];
  // Fallback flat entries for measures with no Yes/No headings
  entries: PolicyEntry[];
  // Explicit acknowledgement that no policies exist for this measure
  noPoliciesIdentified?: boolean;
}

export interface CollectionDetails {
  person: string;
  email: string;
  date: string;
  city: string;
  region: string;
  country: string;
  levelsOfGovernment: string[];  // array of selected levels; joined for xlsx/display
  disasters: Record<string, boolean>;
  disasterOther: string;
  cityContext: string;
  demographics: string;
}

export interface FormData {
  formId: string;
  collectionDetails: CollectionDetails;
  policies: Record<string, MeasureData>;
}

interface PolicyFormProps {
  onSubmit: (formData: FormData) => void;
  onClose: (formData: FormData) => void;
  initialData?: FormData;
}

// ---------- Helpers ----------

function emptyEntry(): PolicyEntry {
  return {
    policy: '', levelOfGovernment: '', adoptionDate: '', citation: '',
    text: '', mandatory: '', measurableTarget: '', measurableTargetText: '',
    evidenceInformedThreshold: '', thresholdExplanation: '', notes: '',
    saved: false,
  };
}

/** Mark all entries in a MeasureData as saved (called on Next/Back). */
function saveAllEntries(data: MeasureData): MeasureData {
  return {
    entries: data.entries.map(e => ({ ...e, saved: true })),
    principles: data.principles.map(p => ({
      ...p,
      entries: p.entries.map(e => ({ ...e, saved: true })),
    })),
    noPoliciesIdentified: data.noPoliciesIdentified,
  };
}

function emptyMeasure(): MeasureData {
  return { principles: [], entries: [], noPoliciesIdentified: false };
}

function totalEntriesForMeasure(data: MeasureData): number {
  return data.entries.length +
    data.principles.reduce((n, p) => n + p.entries.length, 0);
}

// ---------- Sub-components ----------

function CollectionDetailsStep({
  details,
  onChange,
}: {
  details: CollectionDetails;
  onChange: (d: CollectionDetails) => void;
}) {
  const [newLevel, setNewLevel] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const set = (key: keyof CollectionDetails, value: any) =>
    onChange({ ...details, [key]: value });
  const setDisaster = (key: string, val: boolean) =>
    onChange({ ...details, disasters: { ...details.disasters, [key]: val } });

  const addLevel = () => {
    // Split by comma, trim whitespace, filter out empty, dedupe
    const parts = newLevel
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (parts.length === 0) return;
    const existing = new Set(details.levelsOfGovernment);
    const toAdd = parts.filter(lvl => !existing.has(lvl));
    if (toAdd.length === 0) {
      setNewLevel('');
      return;
    }
    set('levelsOfGovernment', [...details.levelsOfGovernment, ...toAdd]);
    setNewLevel('');
  };
  const removeLevel = (level: string) =>
    set('levelsOfGovernment', details.levelsOfGovernment.filter(l => l !== level));
  const moveLevel = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const levels = [...details.levelsOfGovernment];
    const [moved] = levels.splice(fromIdx, 1);
    levels.splice(toIdx, 0, moved);
    set('levelsOfGovernment', levels);
  };

  return (
    <div className="pf-step">
      <h3 className="pf-step-title">Collection Details</h3>
      <p className="pf-step-desc">Provide information about the city and the people completing this checklist.</p>

      <div className="pf-fields">
        <div className="pf-field-row pf-two-col">
          <label className="pf-label">
            City <span className="pf-required">*</span>
            <input className="pf-input" value={details.city}
              onChange={e => set('city', e.target.value)} placeholder="e.g. Melbourne" />
          </label>
          <label className="pf-label">
            Country <span className="pf-required">*</span>
            <input className="pf-input" value={details.country}
              onChange={e => set('country', e.target.value)} placeholder="e.g. Australia" />
          </label>
        </div>

        <label className="pf-label">
          State/Province/Region
          <input className="pf-input" value={details.region}
            onChange={e => set('region', e.target.value)} placeholder="e.g. Victoria" />
        </label>

        <div className="pf-field-row pf-two-col">
          <label className="pf-label">
            Person(s) completing checklist
            <input className="pf-input" value={details.person}
              onChange={e => set('person', e.target.value)} placeholder="Full name(s)" />
          </label>
          <label className="pf-label">
            Email address(es)
            <input className="pf-input" type="email" value={details.email}
              onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
          </label>
        </div>

        <div className="pf-field-row pf-two-col">
          <label className="pf-label">
            Year completed
            <input className="pf-input" value={details.date} type="number" min="2000" max="2099"
              onChange={e => set('date', e.target.value)} placeholder="e.g. 2025" />
          </label>
          <div className="pf-label">
            Levels of government
            <div className="pf-gov-chips">
              {details.levelsOfGovernment.map((level, i) => (
                <span
                  key={level}
                  className={
                    'pf-gov-chip' +
                    (dragIdx === i ? ' pf-gov-chip-dragging' : '') +
                    (dragOverIdx === i && dragIdx !== i ? ' pf-gov-chip-dragover' : '')
                  }
                  draggable
                  title="Drag to reorder"
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                  onDrop={e => { e.preventDefault(); if (dragIdx !== null) moveLevel(dragIdx, i); setDragIdx(null); setDragOverIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                >
                  <span className="pf-gov-chip-drag-handle" aria-hidden>⠿</span>
                  {level}
                  <button
                    type="button"
                    className="pf-gov-chip-remove"
                    onClick={() => removeLevel(level)}
                    title={`Remove ${level}`}
                  >✕</button>
                </span>
              ))}
              <div className="pf-gov-add-row">
                <input
                  className="pf-gov-add-input"
                  value={newLevel}
                  maxLength={200}
                  placeholder="e.g. Local, State, National…"
                  onChange={e => setNewLevel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLevel(); } }}
                />
                <button
                  type="button"
                  className="pf-gov-add-btn"
                  onClick={addLevel}
                  disabled={!newLevel.trim()}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <fieldset className="pf-fieldset">
          <legend className="pf-legend">Environmental disasters (next 5–10 years)</legend>
          <div className="pf-disaster-grid">
            {DISASTER_FIELDS.map(({ key, label }) => (
              <label key={key} className="pf-checkbox-label">
                <input type="checkbox" checked={!!details.disasters[key]}
                  onChange={e => setDisaster(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          <label className="pf-label pf-mt-sm">
            Other (please specify)
            <input className="pf-input" value={details.disasterOther}
              onChange={e => set('disasterOther', e.target.value)} />
          </label>
        </fieldset>

        <label className="pf-label">
          City context
          <textarea className="pf-textarea" rows={4} value={details.cityContext}
            onChange={e => set('cityContext', e.target.value)} placeholder="Briefly summarise the city's location, history and topography."/>
        </label>

        <label className="pf-label">
          Demographics and health equity
          <textarea className="pf-textarea" rows={4} value={details.demographics}
            onChange={e => set('demographics', e.target.value)} placeholder="Briefly summarise socio-economic and health characteristics." />
        </label>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function PolicyEntryCard({
  entry,
  index,
  onChange,
  onRemove,
  simpleMode,
  govLevels,
  onNewLevel,
}: {
  entry: PolicyEntry;
  index: number;
  onChange: (e: PolicyEntry) => void;
  onRemove: () => void;
  simpleMode?: boolean;
  govLevels: string[];
  onNewLevel?: (level: string) => void;
}) {
  const set = (key: keyof PolicyEntry, value: string) => onChange({ ...entry, [key]: value });

  // Handler for tab-delimited paste in policy name field
  const handlePolicyPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t')) return; // Only handle tab-delimited
    e.preventDefault();
    // Split by tab, but allow line breaks in fields
    const values = text.split('\t');
    // Mapping order for PolicyEntry fields
    const keys = [
      'policy',
      'levelOfGovernment',
      'adoptionDate',
      'citation',
      'text',
      'mandatory',
      'measurableTarget',
      'measurableTargetText',
      'evidenceInformedThreshold',
      'thresholdExplanation',
      'notes',
    ] as const;
    const updated: PolicyEntry = { ...entry };
    for (let i = 0; i < Math.min(values.length, keys.length); ++i) {
      updated[keys[i]] = values[i];
    }
    // Keep saved state as-is
    updated.saved = entry.saved;
    onChange(updated);
  };
  const save = () => {
    const level = entry.levelOfGovernment.trim();
    if (level && !govLevels.includes(level) && onNewLevel) onNewLevel(level);
    onChange({ ...entry, saved: true });
  };
  const edit = () => onChange({ ...entry, saved: false });

  if (entry.saved) {
    return (
      <div className="pf-policy-card pf-policy-card-saved">
        <div className="pf-saved-row">
          <span className="pf-saved-name">{entry.policy || <em>Untitled policy</em>}</span>
          {entry.levelOfGovernment && <span className="pf-saved-tag">{entry.levelOfGovernment}</span>}
          {entry.adoptionDate && <span className="pf-saved-tag">{entry.adoptionDate}</span>}
          {entry.mandatory && <span className="pf-saved-tag">Mandatory: {entry.mandatory}</span>}
          <div className="pf-saved-actions">
            <button type="button" className="pf-icon-btn" onClick={edit} title="Edit policy">✏️</button>
            <button type="button" className="pf-remove-btn" onClick={onRemove} title="Remove this policy">✕</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-policy-card">
      <div className="pf-policy-card-header">
        <span className="pf-policy-card-title">Policy {index + 1}</span>
        <div className="pf-card-header-actions">
          <button type="button" className="pf-save-btn" onClick={save} title="Save this policy">✓ Save</button>
          <button type="button" className="pf-remove-btn" onClick={onRemove} title="Remove this policy">✕</button>
        </div>
      </div>

      <div className="pf-fields">
        <label className="pf-label">
          Policy name <span className="pf-required">*</span>
          <input
            className="pf-input"
            value={entry.policy}
            onChange={e => set('policy', e.target.value)}
            onPaste={handlePolicyPaste}
            placeholder="Name of the policy document"
          />
        </label>

        <div className={`pf-field-row ${simpleMode ? 'pf-two-col' : 'pf-three-col'}`}>
          <label className="pf-label">
            Level of government
            {govLevels.length > 0 && (
              <datalist id="pf-gov-levels-list">
                {govLevels.map(l => <option key={l} value={l} />)}
              </datalist>
            )}
            <input
              className="pf-input"
              list={govLevels.length > 0 ? 'pf-gov-levels-list' : undefined}
              value={entry.levelOfGovernment}
              onChange={e => set('levelOfGovernment', e.target.value)}
              placeholder={govLevels.length > 0 ? 'Select or type…' : 'e.g. Local, National…'}
            />
          </label>
          {!simpleMode && (
            <label className="pf-label">
              Adoption year
              <input className="pf-input" type="number" min="1900" max="2099"
                value={entry.adoptionDate}
                onChange={e => set('adoptionDate', e.target.value)} placeholder="yyyy" />
            </label>
          )}
          {!simpleMode && (
            <label className="pf-label">
              Mandatory?
              <select className="pf-select" value={entry.mandatory}
                onChange={e => set('mandatory', e.target.value)}>
                <option value="">— Select —</option>
                <option>Yes</option>
                <option>No</option>
                <option>Unclear</option>
              </select>
            </label>
          )}
        </div>

        {!simpleMode && (
          <label className="pf-label">
            URL / Citation
            <input className="pf-input" value={entry.citation}
              onChange={e => set('citation', e.target.value)} placeholder="URL or bibliographic reference" />
          </label>
        )}

        {!simpleMode && (
          <label className="pf-label">
            Relevant text excerpt
            <textarea className="pf-textarea" rows={3} value={entry.text}
              onChange={e => set('text', e.target.value)}
              placeholder='e.g. p44-"Increase average gross densities…"' />
          </label>
        )}

        {!simpleMode && (
          <div className="pf-field-row pf-three-col">
            <label className="pf-label">
              Measurable target?
              <select className="pf-select" value={entry.measurableTarget}
                onChange={e => set('measurableTarget', e.target.value)}>
                <option value="">— Select —</option>
                <option>Yes</option>
                <option>No</option>
                <option>Unclear</option>
              </select>
            </label>
            <label className="pf-label pf-col-span-2">
              Measurable target text
              <input className="pf-input" value={entry.measurableTargetText}
                onChange={e => set('measurableTargetText', e.target.value)}
                placeholder="Copy the relevant target here (if Yes)" />
            </label>
          </div>
        )}

        {!simpleMode && entry.measurableTarget === 'Yes' && (
          <div className="pf-field-row pf-two-col">
            <label className="pf-label">
              Evidence-informed threshold?
              <select className="pf-select" value={entry.evidenceInformedThreshold}
                onChange={e => set('evidenceInformedThreshold', e.target.value)}>
                <option value="">— Select —</option>
                <option>Yes</option>
                <option>No</option>
                <option>Unclear</option>
              </select>
            </label>
            <label className="pf-label">
              Threshold explanation
              <input className="pf-input" value={entry.thresholdExplanation}
                onChange={e => set('thresholdExplanation', e.target.value)}
                placeholder="Cite evidence or explain" />
            </label>
          </div>
        )}

        <label className="pf-label">
          Notes
          <input className="pf-input" value={entry.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any other relevant information" />
        </label>
      </div>
    </div>
  );
}

// Special entry card for the boolean "combined department" measure
function CombinedDeptEntryCard({
  entry,
  index,
  onChange,
  onRemove,
  govLevels,
  onNewLevel,
}: {
  entry: PolicyEntry;
  index: number;
  onChange: (e: PolicyEntry) => void;
  onRemove: () => void;
  govLevels: string[];
  onNewLevel?: (level: string) => void;
}) {
  const set = (key: keyof PolicyEntry, value: string) => onChange({ ...entry, [key]: value });
  const save = () => {
    const level = entry.levelOfGovernment.trim();
    if (level && !govLevels.includes(level) && onNewLevel) onNewLevel(level);
    onChange({ ...entry, saved: true });
  };
  const edit = () => onChange({ ...entry, saved: false });

  if (entry.saved) {
    return (
      <div className="pf-policy-card pf-policy-card-saved">
        <div className="pf-saved-row">
          <span className="pf-saved-name">{entry.levelOfGovernment || <em>No level selected</em>}</span>
          {entry.policy && (
            <span className={`pf-saved-tag pf-saved-tag-${entry.policy.toLowerCase()}`}>
              {entry.policy === 'Yes' ? 'Combined' : 'Separate'}
            </span>
          )}
          {entry.notes && <span className="pf-saved-notes">{entry.notes}</span>}
          <div className="pf-saved-actions">
            <button type="button" className="pf-icon-btn" onClick={edit} title="Edit">✏️</button>
            <button type="button" className="pf-remove-btn" onClick={onRemove} title="Remove">✕</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-policy-card">
      <div className="pf-policy-card-header">
        <span className="pf-policy-card-title">Response {index + 1}</span>
        <div className="pf-card-header-actions">
          <button type="button" className="pf-save-btn" onClick={save} title="Save">✓ Save</button>
          <button type="button" className="pf-remove-btn" onClick={onRemove} title="Remove">✕</button>
        </div>
      </div>
      <div className="pf-fields">
        <div className="pf-field-row pf-two-col">
          <label className="pf-label">
            Level of government <span className="pf-required">*</span>
            {govLevels.length > 0 && (
              <datalist id="pf-gov-levels-list-dept">
                {govLevels.map(l => <option key={l} value={l} />)}
              </datalist>
            )}
            <input
              className="pf-input"
              list={govLevels.length > 0 ? 'pf-gov-levels-list-dept' : undefined}
              value={entry.levelOfGovernment}
              onChange={e => set('levelOfGovernment', e.target.value)}
              placeholder={govLevels.length > 0 ? 'Select or type…' : 'e.g. Local, National…'}
            />
          </label>
          <label className="pf-label">
            Transport &amp; planning combined? <span className="pf-required">*</span>
            <select className="pf-select" value={entry.policy}
              onChange={e => set('policy', e.target.value)}>
              <option value="">— Select —</option>
              <option value="Yes">Yes — combined in one department</option>
              <option value="No">No — separate departments</option>
            </select>
          </label>
        </div>
        <label className="pf-label">
          Notes
          <input className="pf-input" value={entry.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any other relevant information" />
        </label>
      </div>
    </div>
  );
}

// A single principle row (with its policy cards and add button)
function PrincipleSection({
  pe,
  onUpdate,
  onRemove,
  simpleMode,
  govLevels,
  onNewLevel,
  open,
  onToggle,
}: {
  pe: PrincipleEntry;
  onUpdate: (updated: PrincipleEntry) => void;
  onRemove: (() => void) | null; // null = cannot remove (predefined)
  simpleMode?: boolean;
  govLevels: string[];
  onNewLevel?: (level: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const qualifierClass = pe.qualifier === 'Yes' ? 'pf-principle-yes' : 'pf-principle-no';
  const policyCount = pe.entries.length;

  const addEntry = () => onUpdate({
    ...pe,
    // auto-save unsaved entries before adding a new one
    entries: [...pe.entries.map(e => ({ ...e, saved: true })), emptyEntry()],
  });
  const updateEntry = (i: number, e: PolicyEntry) => {
    const entries = [...pe.entries]; entries[i] = e;
    onUpdate({ ...pe, entries });
  };
  const removeEntry = (i: number) =>
    onUpdate({ ...pe, entries: pe.entries.filter((_, idx) => idx !== i) });

  return (
    <div className={`pf-principle ${qualifierClass}${open ? ' pf-principle-open' : ''}`}>
      <div className="pf-principle-header">
        <button type="button" className="pf-principle-toggle" onClick={onToggle}>
          <span className={`pf-principle-badge pf-badge-${pe.qualifier.toLowerCase()}`}>
            {pe.qualifier}
          </span>
          {pe.isOther ? (
            <input
              className="pf-principle-label-input"
              value={pe.principle}
              placeholder="Describe your principle…"
            />
          ) : (
            <span className="pf-principle-label">{pe.principle}</span>
          )}
          <span className="pf-principle-count">
            {policyCount > 0 ? `${policyCount} polic${policyCount === 1 ? 'y' : 'ies'}` : 'No policies'}
          </span>
          <span className="pf-measure-chevron">{open ? '▲' : '▼'}</span>
        </button>
        {onRemove && (
          <button type="button" className="pf-remove-btn" onClick={onRemove} title="Remove principle">✕</button>
        )}
      </div>
      {open && (
        <div className="pf-principle-body">
          {pe.entries.map((entry, i) => (
            <PolicyEntryCard
              key={i}
              index={i}
              entry={entry}
              onChange={e => updateEntry(i, e)}
              onRemove={() => removeEntry(i)}
              simpleMode={simpleMode}
              govLevels={govLevels}
              onNewLevel={onNewLevel}
            />
          ))}
          <button type="button" className="pf-add-policy-btn" onClick={addEntry}>
            + Add policy under this principle
          </button>
        </div>
      )}
    </div>
  );
}

function MeasureSection({
  measure,
  data,
  onChange,
  govLevels,
  onNewLevel,
}: {
  measure: string;
  data: MeasureData;
  onChange: (d: MeasureData) => void;
  govLevels: string[];
  onNewLevel?: (level: string) => void;
}) {
  const pg = MEASURE_PRINCIPLES[measure];
  const isCombinedDept = measure === 'Transport and planning combined in one government department';
  const hasNoPrinciples = !pg || (pg.yesLabel === null && pg.noLabel === null);
  const totalEntries = totalEntriesForMeasure(data);

  const toggleNoPolicies = () => onChange({
    ...data,
    noPoliciesIdentified: !data.noPoliciesIdentified,
  });

  // ── Helpers for flat-entry mode (no Yes/No headings) ──────────────
  const addFlatEntry = () => onChange({
    ...data,
    noPoliciesIdentified: false,
    // auto-save unsaved entries before adding a new one
    entries: [...data.entries.map(e => ({ ...e, saved: true })), emptyEntry()],
  });
  const updateFlatEntry = (i: number, e: PolicyEntry) => {
    const entries = [...data.entries]; entries[i] = e;
    onChange({ ...data, entries });
  };
  const removeFlatEntry = (i: number) =>
    onChange({ ...data, entries: data.entries.filter((_, idx) => idx !== i) });

  // ── Helpers for principle mode ────────────────────────────────────
  const updatePrinciple = (i: number, updated: PrincipleEntry) => {
    const principles = [...data.principles]; principles[i] = updated;
    onChange({ ...data, principles });
  };
  const removePrinciple = (i: number) =>
    onChange({ ...data, principles: data.principles.filter((_, idx) => idx !== i) });

  // Only one principle open at a time
  const [openPrincipleIdx, setOpenPrincipleIdx] = useState<number | null>(null);

  // Build the set of predefined principle texts already added
  const addedPrinciples = new Set(data.principles.filter(p => !p.isOther).map(p => p.principle));

  // Add a predefined principle (if not already present)
  const addPredefinedPrinciple = (text: string, qualifier: 'Yes' | 'No') => {
    if (addedPrinciples.has(text)) return;
    onChange({
      ...data,
      noPoliciesIdentified: false,
      principles: [...data.principles, { principle: text, isOther: false, qualifier, entries: [] }],
    });
  };

  // Add a user-defined "Other" principle
  const addOtherPrinciple = (qualifier: 'Yes' | 'No') => {
    onChange({
      ...data,
      noPoliciesIdentified: false,
      principles: [...data.principles, { principle: '', isOther: true, qualifier, entries: [] }],
    });
  };

  return (
    <div className="pf-measure">
      {(
        <div className="pf-measure-body">
          {pg.yesLabel !== null && pg.noLabel !== null && (
          <div>
            <p className="pf-step-desc">
              For each policy identified, enter information according to whether the policy aligns with the principles of healthy and sustainable cities (Yes or No).
            </p>
          </div>)}
          {/* ── Flat-entry mode: no principles ─────────────────── */}
          {hasNoPrinciples && (
            <>
              {isCombinedDept
                ? data.entries.map((entry, i) => (
                    <CombinedDeptEntryCard
                      key={i}
                      index={i}
                      entry={entry}
                      onChange={e => updateFlatEntry(i, e)}
                      onRemove={() => removeFlatEntry(i)}
                      govLevels={govLevels}
                      onNewLevel={onNewLevel}
                    />
                  ))
                : data.entries.map((entry, i) => (
                    <PolicyEntryCard
                      key={i}
                      index={i}
                      entry={entry}
                      onChange={e => updateFlatEntry(i, e)}
                      onRemove={() => removeFlatEntry(i)}
                      govLevels={govLevels}
                      onNewLevel={onNewLevel}
                    />
                  ))
              }
              <div className="pf-measure-actions">
                <button type="button" className="pf-add-policy-btn" onClick={addFlatEntry}>
                  {isCombinedDept ? '+ Add level of government' : '+ Add policy'}
                </button>
                {/* Show 'No policies identified' button only if there are zero policies */}
                {!isCombinedDept && totalEntries === 0 && (
                  <button
                    type="button"
                    className={`pf-no-policies-btn${data.noPoliciesIdentified ? ' pf-no-policies-active' : ''}`}
                    onClick={toggleNoPolicies}
                  >
                    {data.noPoliciesIdentified ? '✓ No policies identified' : 'No policies identified'}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Principle mode ─────────────────────────────────── */}
          {!hasNoPrinciples && (
            <>
              {/* Render principles already added */}
              {data.principles.map((pe, i) => (
                <PrincipleSection
                  key={i}
                  pe={pe}
                  onUpdate={updated => updatePrinciple(i, updated)}
                  // Allow removal if 'Other' or if no policies are aligned
                  onRemove={pe.isOther || pe.entries.length === 0 ? () => removePrinciple(i) : null}
                  govLevels={govLevels}
                  onNewLevel={onNewLevel}
                  open={openPrincipleIdx === i}
                  onToggle={() => setOpenPrincipleIdx(openPrincipleIdx === i ? null : i)}
                />
              ))}

              {/* Yes section ─ predefined + Other */}
              {pg.yesLabel !== null && (
                <div className="pf-add-principle-group">
                  <span className={`pf-principle-badge pf-badge-yes`}>{pg.yesLabel}</span>
                  <div className="pf-add-principle-btns">
                    {/* Group principles with '...' parent and '... ' children */}
                    {(() => {
                      const grouped: Array<{parent: string|null, children: string[]}> = [];
                      let currentParent: string|null = null;
                      let currentChildren: string[] = [];
                      const filtered = pg.yesPrinciples.filter(p => !addedPrinciples.has(p));
                      for (let i = 0; i < filtered.length; ++i) {
                        const p = filtered[i];
                        if (p.endsWith('…')) {
                          // If we have a previous group, push it
                          if (currentParent || currentChildren.length > 0) {
                            grouped.push({parent: currentParent, children: currentChildren});
                          }
                          currentParent = p;
                          currentChildren = [];
                        } else if (p.startsWith('… ')) {
                          currentChildren.push(p);
                        } else {
                          // If we have a previous group, push it
                          if (currentParent || currentChildren.length > 0) {
                            grouped.push({parent: currentParent, children: currentChildren});
                            currentParent = null;
                            currentChildren = [];
                          }
                          // Standalone principle
                          grouped.push({parent: null, children: [p]});
                        }
                      }
                      // Push any remaining group
                      if (currentParent || currentChildren.length > 0) {
                        grouped.push({parent: currentParent, children: currentChildren});
                      }
                      return grouped.map(group => (
                        group.parent ? (
                          <div key={group.parent} className="pf-principle-parent-group">
                            <div className="pf-principle-parent-label">{group.parent}</div>
                            <div className="pf-add-principle-btns pf-principle-children">
                              {group.children.map(child => (
                                <button
                                  key={child}
                                  type="button"
                                  className="pf-add-principle-btn"
                                  onClick={() => addPredefinedPrinciple(child, 'Yes')}
                                  title={child}
                                >
                                  + {child.length > 60 ? child.slice(0, 57) + '…' : child}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          group.children.map(child => (
                            <button
                              key={child}
                              type="button"
                              className="pf-add-principle-btn"
                              onClick={() => addPredefinedPrinciple(child, 'Yes')}
                              title={child}
                            >
                              + {child.length > 60 ? child.slice(0, 57) + '…' : child}
                            </button>
                          ))
                        )
                      ));
                    })()}
                    <button
                      type="button"
                      className="pf-add-principle-btn pf-add-other-btn"
                      onClick={() => addOtherPrinciple('Yes')}
                    >
                      + Other Yes principle…
                    </button>
                  </div>
                </div>
              )}

              {/* No section ─ predefined + Other */}
              {pg.noLabel !== null && (
                <div className="pf-add-principle-group pf-add-principle-group-no">
                  <span className={`pf-principle-badge pf-badge-no`}>{pg.noLabel}</span>
                  <div className="pf-add-principle-btns">
                    {/* Group principles with '...' parent and '... ' children for No section */}
                    {(() => {
                      const grouped: Array<{parent: string|null, children: string[]}> = [];
                      let currentParent: string|null = null;
                      let currentChildren: string[] = [];
                      const filtered = pg.noPrinciples.filter(p => !addedPrinciples.has(p));
                      for (let i = 0; i < filtered.length; ++i) {
                        const p = filtered[i];
                        if (p.endsWith('…')) {
                          if (currentParent || currentChildren.length > 0) {
                            grouped.push({parent: currentParent, children: currentChildren});
                          }
                          currentParent = p;
                          currentChildren = [];
                        } else if (p.startsWith('… ')) {
                          currentChildren.push(p);
                        } else {
                          if (currentParent || currentChildren.length > 0) {
                            grouped.push({parent: currentParent, children: currentChildren});
                            currentParent = null;
                            currentChildren = [];
                          }
                          grouped.push({parent: null, children: [p]});
                        }
                      }
                      if (currentParent || currentChildren.length > 0) {
                        grouped.push({parent: currentParent, children: currentChildren});
                      }
                      return grouped.map(group => (
                        group.parent ? (
                          <div key={group.parent} className="pf-principle-parent-group">
                            <div className="pf-principle-parent-label">{group.parent}</div>
                            <div className="pf-add-principle-btns pf-principle-children">
                              {group.children.map(child => (
                                <button
                                  key={child}
                                  type="button"
                                  className="pf-add-principle-btn pf-add-principle-btn-no"
                                  onClick={() => addPredefinedPrinciple(child, 'No')}
                                  title={child}
                                >
                                  + {child.length > 60 ? child.slice(0, 57) + '…' : child}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          group.children.map(child => (
                            <button
                              key={child}
                              type="button"
                              className="pf-add-principle-btn pf-add-principle-btn-no"
                              onClick={() => addPredefinedPrinciple(child, 'No')}
                              title={child}
                            >
                              + {child.length > 60 ? child.slice(0, 57) + '…' : child}
                            </button>
                          ))
                        )
                      ));
                    })()}
                    <button
                      type="button"
                      className="pf-add-principle-btn pf-add-principle-btn-no pf-add-other-btn"
                      onClick={() => addOtherPrinciple('No')}
                    >
                      + Other No principle…
                    </button>
                  </div>
                </div>
              )}

              {/* Show 'No policies identified' button only if there are zero policies */}
              {totalEntries === 0 && (
                <button
                  type="button"
                  className={`pf-no-policies-btn${data.noPoliciesIdentified ? ' pf-no-policies-active' : ''}`}
                  onClick={toggleNoPolicies}
                >
                  {data.noPoliciesIdentified ? '✓ No policies identified' : 'No policies identified'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PolicyChecklistStep({
  policies,
  onChange,
  govLevels,
  onNewLevel,
}: {
  policies: Record<string, MeasureData>;
  onChange: (p: Record<string, MeasureData>) => void;
  govLevels: string[];
  onNewLevel?: (level: string) => void;
}) {

  // Only one indicator and one measure open at a time
  const [openIndicator, setOpenIndicator] = useState<string | null>(null);
  const [openMeasure, setOpenMeasure] = useState<string | null>(null);

  const handleIndicatorClick = (ind: string) => {
    setOpenIndicator(prev => (prev === ind ? null : ind));
    setOpenMeasure(null); // close any open measure when switching indicator
  };
  const handleMeasureClick = (measure: string) => {
    setOpenMeasure(prev => (prev === measure ? null : measure));
  };

  const updateMeasure = (measure: string, data: MeasureData) =>
    onChange({ ...policies, [measure]: data });

  // Calculate overall completion percentage
  const allMeasures = Object.values(GHSCI_INDICATORS).flat();
  const completedMeasures = allMeasures.filter(m => {
    const data = policies[m] ?? emptyMeasure();
    return totalEntriesForMeasure(data) > 0 || data.noPoliciesIdentified;
  }).length;
  const percentComplete = allMeasures.length === 0 ? 0 : Math.round((completedMeasures / allMeasures.length) * 100);

  return (
    <div className="pf-step">
      <h3 className="pf-step-title">
        Policy Checklist ({percentComplete}% complete)
      </h3>
      <p className="pf-step-desc">
        For each indicator, expand to see the policy options and enter relevant policy information. Indicators without any policies entered must be scored as 'No policies identified'.
      </p>

      {Object.entries(GHSCI_INDICATORS).map(([indicator, measures]) => {
        // Count completed measures: at least one policy OR marked as noPoliciesIdentified
        const completed = measures.filter(m => {
          const data = policies[m] ?? emptyMeasure();
          return totalEntriesForMeasure(data) > 0 || data.noPoliciesIdentified;
        }).length;
        const isOpen = openIndicator === indicator;
        return (
          <div key={indicator} className="pf-indicator">
            <button
              type="button"
              className={`pf-indicator-header${isOpen ? ' pf-indicator-open' : ''}`}
              onClick={() => handleIndicatorClick(indicator)}
            >
              <span className="pf-indicator-name">{indicator}</span>
              <span className="pf-indicator-badge">
                {completed}/{measures.length} completed
              </span>
              <span className="pf-measure-chevron">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="pf-indicator-body">
                {measures.map(measure => {
                  const measureOpen = openMeasure === measure;
                  const data = policies[measure] ?? emptyMeasure();
                  // Compute label for badge
                  const totalEntries = totalEntriesForMeasure(data);
                  const isCombinedDept = measure === 'Transport and planning combined in one government department';
                  const label = totalEntries > 0
                    ? (isCombinedDept
                        ? `${totalEntries} level${totalEntries === 1 ? '' : 's'} of government entered`
                        : `${totalEntries} polic${totalEntries === 1 ? 'y' : 'ies'} entered`)
                    : data.noPoliciesIdentified
                      ? 'No policies identified'
                      : (isCombinedDept ? 'No responses entered' : 'No policies entered');
                  return (
                    <div key={measure} className="pf-measure-accordion">
                      <button
                        type="button"
                        className={`pf-measure-header${measureOpen ? ' pf-measure-open' : ''}`}
                        onClick={() => handleMeasureClick(measure)}
                      >
                        <span className="pf-measure-name">{measure}</span>
                        <span className="pf-measure-badge">{label}</span>
                        <span className="pf-measure-chevron">{measureOpen ? '▲' : '▼'}</span>
                      </button>
                      {measureOpen && (
                        <MeasureSection
                          measure={measure}
                          data={data}
                          onChange={d => updateMeasure(measure, d)}
                          govLevels={govLevels}
                          onNewLevel={onNewLevel}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewStep({ formData }: { formData: FormData }) {
  const cd = formData.collectionDetails;
  const totalPolicies = Object.values(formData.policies).reduce(
    (n, m) => n + totalEntriesForMeasure(m), 0
  );
  const measuresWithPolicies = Object.values(formData.policies).filter(
    m => totalEntriesForMeasure(m) > 0
  ).length;
  const measuresNoPoliciesIdentified = Object.values(formData.policies).filter(
    m => m.noPoliciesIdentified && totalEntriesForMeasure(m) === 0
  ).length;

  return (
    <div className="pf-step">
      <h3 className="pf-step-title">Review &amp; Submit</h3>

      <div className="pf-review-section">
        <h4 className="pf-review-heading">Collection Details</h4>
        <table className="pf-review-table">
          <tbody>
            {cd.city && <tr><th>City</th><td>{cd.city}</td></tr>}
            {cd.country && <tr><th>Country</th><td>{cd.country}</td></tr>}
            {cd.region && <tr><th>Region</th><td>{cd.region}</td></tr>}
            {cd.person && <tr><th>Person(s)</th><td>{cd.person}</td></tr>}
            {cd.email && <tr><th>Email</th><td>{cd.email}</td></tr>}
            {cd.date && <tr><th>Year</th><td>{cd.date}</td></tr>}
            {cd.levelsOfGovernment.length > 0 && <tr><th>Levels of government</th><td>{cd.levelsOfGovernment.join(', ')}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="pf-review-section">
        <h4 className="pf-review-heading">Policy Checklist</h4>
        <p>
          <strong>{measuresWithPolicies}</strong> measure{measuresWithPolicies !== 1 ? 's' : ''} with policies entered
          ({' '}<strong>{totalPolicies}</strong> polic{totalPolicies !== 1 ? 'ies' : 'y'} total).
          {measuresNoPoliciesIdentified > 0 && (
            <>{' '}<strong>{measuresNoPoliciesIdentified}</strong> measure{measuresNoPoliciesIdentified !== 1 ? 's' : ''} marked as &ldquo;No policies identified&rdquo;.</>
          )}
        </p>
        {measuresWithPolicies === 0 && (
          <p className="pf-warning">
            No policies have been entered. The report will show zero scores. You can go back and add policies, or submit now to generate a blank report.
          </p>
        )}
      </div>

      <p className="pf-submit-note">
        Submitting will generate your PDF report and policy audit results.
      </p>
    </div>
  );
}

// ---------- Main Form ----------

const STEPS = ['Collection Details', 'Policy Checklist', 'Review & Submit'];

function generateFormId() {
  // Use a simple timestamp + random for uniqueness; replace with uuid if needed
  return `form-${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
}

export function PolicyForm({ onSubmit, onClose, initialData }: PolicyFormProps) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // If initialData has a formId, use it; otherwise generate a new one
  const [formId] = useState(() => initialData?.formId || generateFormId());

  const [collectionDetails, setCollectionDetails] = useState<CollectionDetails>(
    initialData?.collectionDetails ?? {
      person: '', email: '', date: '', city: '', region: '', country: '',
      levelsOfGovernment: [],
      disasters: {},
      disasterOther: '', cityContext: '', demographics: '',
    }
  );

  const [policies, setPolicies] = useState<Record<string, MeasureData>>(
    initialData?.policies ?? {}
  );

  const formData: FormData = { formId, collectionDetails, policies };

  // Back-add any novel level of government entered in policy cards to collectionDetails
  const handleNewLevel = (level: string) => {
    setCollectionDetails(prev => {
      if (prev.levelsOfGovernment.includes(level)) return prev;
      return { ...prev, levelsOfGovernment: [...prev.levelsOfGovernment, level] };
    });
  };

  // Harvest novel levels from all entries in a saved-policies snapshot
  const harvestLevels = (savedPolicies: Record<string, MeasureData>) => {
    setCollectionDetails(prev => {
      const existing = new Set(prev.levelsOfGovernment);
      const toAdd: string[] = [];
      Object.values(savedPolicies).forEach(md => {
        [...md.entries, ...md.principles.flatMap(p => p.entries)].forEach(e => {
          const l = e.levelOfGovernment.trim();
          if (l && !existing.has(l)) { existing.add(l); toAdd.push(l); }
        });
      });
      if (toAdd.length === 0) return prev;
      return { ...prev, levelsOfGovernment: [...prev.levelsOfGovernment, ...toAdd] };
    });
  };

  const canAdvance = step === 0
    ? !!collectionDetails.city.trim() && !!collectionDetails.country.trim()
    : true;

  const handleSubmit = async () => {
    // Validate that every measure has either policies or explicit "No policies identified"
    const unaddressed: string[] = [];
    for (const [, measures] of Object.entries(GHSCI_INDICATORS)) {
      for (const measure of measures) {
        const md = policies[measure] ?? emptyMeasure();
        const hasEntries = totalEntriesForMeasure(md) > 0;
        if (!hasEntries && !md.noPoliciesIdentified) {
          unaddressed.push(measure);
        }
      }
    }
    if (unaddressed.length > 0) {
      alert(
        'The following measures have no policies entered and have not been explicitly marked as "No policies identified":\n\n' +
        unaddressed.map(m => `• ${m}`).join('\n') +
        '\n\nPlease address each measure before submitting.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    const city = collectionDetails.city.trim();
    const country = collectionDetails.country.trim();
    if (!city || !country) {
      const ok = window.confirm(
        'City and Country are required to save an incomplete draft.\n\n' +
        'If you close now, your progress will be lost.\n\n' +
        'Close without saving?'
      );
      if (!ok) return;
    }
    onClose(formData);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content pf-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <button onClick={handleClose} className="btn btn-close">🗙</button>
          <h3 style={{ margin: 0 }}>Complete a new policy audit</h3>
        </div>

        {/* Step indicator */}
        <div className="pf-step-indicator">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <button
                type="button"
                className={`pf-step-dot-btn${i === step ? ' pf-step-dot-active' : i < step ? ' pf-step-dot-done' : ''}`}
                title={label}
                onClick={() => setStep(i)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                aria-current={i === step ? 'step' : undefined}
              >
              <div
                className={`pf-step-dot${i === step ? ' pf-step-dot-active' : i < step ? ' pf-step-dot-done' : ''}`}
                title={label}
              >
                {i + 1}
                </div>
              </button>
              <span
                className="pf-step-label"
                style={{ cursor: 'pointer' }}
                onClick={() => setStep(i)}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="pf-step-line" />}
            </React.Fragment>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="pf-body">
          {step === 0 && (
            <CollectionDetailsStep
              details={collectionDetails}
              onChange={setCollectionDetails}
            />
          )}
          {step === 1 && (
            <PolicyChecklistStep
              policies={policies}
              onChange={setPolicies}
              govLevels={collectionDetails.levelsOfGovernment}
              onNewLevel={handleNewLevel}
            />
          )}
          {step === 2 && <ReviewStep formData={formData} />}
        </div>

        {/* Footer */}
        <div className="pf-footer">
          {step > 0 && (
            <button className="btn btn-primary" onClick={() => {
              const saved = Object.fromEntries(
                Object.entries(policies).map(([k, v]) => [k, saveAllEntries(v)])
              );
              setPolicies(saved);
              harvestLevels(saved);
              setStep(s => s - 1);
            }}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                const saved = Object.fromEntries(
                  Object.entries(policies).map(([k, v]) => [k, saveAllEntries(v)])
                );
                setPolicies(saved);
                harvestLevels(saved);
                setStep(s => s + 1);
              }}
              disabled={!canAdvance}
              title={!canAdvance ? 'Please enter City and Country to continue' : undefined}
            >
              Next →
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
