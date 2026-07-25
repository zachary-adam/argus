export interface HistoricalAnalog {
  id: string
  country: string
  period: string          // human-readable, e.g. "Feb 2022"
  label: string           // short title
  summary: string         // 1-2 sentence description
  outcome: string         // what happened next
  trajectory: 'escalated' | 'frozen' | 'stabilized' | 'collapse' | 'negotiated'
  daysToOutcome: number   // how quickly the outcome manifested
  features: {
    conflict:      number  // 0–1
    political:     number  // 0–1
    humanitarian:  number  // 0–1
    severity:      number  // 0–1
    velocity:      number  // 0–1  (acceleration rate)
  }
}

export const HISTORICAL_ANALOGS: HistoricalAnalog[] = [
  {
    id: 'ukraine-2022',
    country: 'Ukraine', period: 'Feb 2022', label: 'Russian Full-Scale Invasion Onset',
    summary: 'Russia launched a full-scale invasion with armored columns advancing on Kyiv, Kharkiv, and Mariupol simultaneously. Largest conventional war in Europe since 1945.',
    outcome: 'Ongoing high-intensity conventional war. Kyiv advance repelled within 30 days. Conflict froze along eastern and southern lines.',
    trajectory: 'escalated', daysToOutcome: 30,
    features: { conflict: 0.85, political: 0.05, humanitarian: 0.04, severity: 0.58, velocity: 0.95 },
  },
  {
    id: 'ukraine-2014',
    country: 'Ukraine', period: 'Feb–Mar 2014', label: 'Maidan Revolution & Crimea Annexation',
    summary: 'Yanukovych fled after Maidan protests. Russia annexed Crimea and backed separatist forces in Donbas within weeks.',
    outcome: 'Crimea annexed. Frozen conflict in Donbas persisted for 8 years. Government stabilized under new administration.',
    trajectory: 'frozen', daysToOutcome: 21,
    features: { conflict: 0.35, political: 0.70, humanitarian: 0.04, severity: 0.48, velocity: 0.72 },
  },
  {
    id: 'libya-2011',
    country: 'Libya', period: 'Feb 2011', label: 'Civil War Onset',
    summary: 'Protests in Benghazi escalated to armed conflict within days. Gaddafi forces advanced on civilian areas, triggering NATO intervention.',
    outcome: 'NATO airstrikes began Day 47. Gaddafi regime collapsed in August. Country fragmented into armed factions.',
    trajectory: 'escalated', daysToOutcome: 47,
    features: { conflict: 0.60, political: 0.35, humanitarian: 0.05, severity: 0.62, velocity: 0.80 },
  },
  {
    id: 'syria-2011',
    country: 'Syria', period: 'Mar–Jun 2011', label: 'Civil War Onset',
    summary: 'Protests in Deraa met with lethal force. Security service defections began by May. Scattered armed resistance coalesced into opposition forces.',
    outcome: 'Full-scale civil war by 2012. Over 600,000 killed. 6.5 million internally displaced.',
    trajectory: 'escalated', daysToOutcome: 90,
    features: { conflict: 0.45, political: 0.55, humanitarian: 0.05, severity: 0.58, velocity: 0.68 },
  },
  {
    id: 'sudan-2023',
    country: 'Sudan', period: 'Apr 2023', label: 'SAF–RSF War Outbreak',
    summary: 'Fighting erupted between the Sudanese Armed Forces and Rapid Support Forces across Khartoum and Darfur. Hospitals, infrastructure, and civilian areas struck within hours.',
    outcome: 'Full urban warfare in Khartoum. Over 9 million displaced within 6 months. Largest displacement crisis globally by mid-2024.',
    trajectory: 'escalated', daysToOutcome: 14,
    features: { conflict: 0.88, political: 0.06, humanitarian: 0.05, severity: 0.72, velocity: 0.92 },
  },
  {
    id: 'myanmar-2021',
    country: 'Myanmar', period: 'Feb 2021', label: 'Military Coup & Civil Disobedience',
    summary: 'Tatmadaw seized power, arrested Aung San Suu Kyi, and declared a state of emergency. Mass civil disobedience and security crackdowns followed.',
    outcome: 'Coup consolidated. Armed resistance (PDF) formed by April. Country entered low-intensity civil war across multiple states.',
    trajectory: 'escalated', daysToOutcome: 60,
    features: { conflict: 0.28, political: 0.78, humanitarian: 0.06, severity: 0.50, velocity: 0.75 },
  },
  {
    id: 'ethiopia-tigray-2020',
    country: 'Ethiopia', period: 'Nov 2020', label: 'Tigray War Onset',
    summary: 'Federal forces launched an offensive against the Tigray People\'s Liberation Front after TPLF attacked a federal military base. Eritrean forces entered from the north.',
    outcome: 'Two-year war. Estimated 300,000–500,000 conflict-related deaths. Tigray under blockade for extended periods.',
    trajectory: 'escalated', daysToOutcome: 21,
    features: { conflict: 0.78, political: 0.15, humanitarian: 0.06, severity: 0.65, velocity: 0.80 },
  },
  {
    id: 'georgia-2008',
    country: 'Georgia', period: 'Aug 2008', label: 'Five-Day War with Russia',
    summary: 'Georgia launched an artillery offensive on Tskhinvali. Russia responded with a massive combined-arms counteroffensive advancing toward Tbilisi.',
    outcome: 'Ceasefire brokered by France on Day 5. Russia recognized South Ossetia and Abkhazia. Frozen conflict persists.',
    trajectory: 'frozen', daysToOutcome: 5,
    features: { conflict: 0.90, political: 0.04, humanitarian: 0.03, severity: 0.62, velocity: 0.98 },
  },
  {
    id: 'nagorno-karabakh-2020',
    country: 'Azerbaijan', period: 'Sep 2020', label: '44-Day War',
    summary: 'Azerbaijan launched a combined-arms offensive with Turkish-supplied drones. Armenia struggled to defend against new air-to-ground capabilities.',
    outcome: '44-day war ended by Russian-brokered ceasefire. Azerbaijan recaptured ~75% of contested territories.',
    trajectory: 'frozen', daysToOutcome: 44,
    features: { conflict: 0.92, political: 0.04, humanitarian: 0.04, severity: 0.72, velocity: 0.92 },
  },
  {
    id: 'afghanistan-2021',
    country: 'Afghanistan', period: 'Aug 2021', label: 'Taliban Takeover',
    summary: 'Taliban seized provincial capitals in rapid succession following US withdrawal. Kabul fell in 11 days. Government collapsed without significant resistance.',
    outcome: 'Complete government collapse. Taliban controls entire country. 124,000 people evacuated. Deep humanitarian crisis followed.',
    trajectory: 'collapse', daysToOutcome: 11,
    features: { conflict: 0.82, political: 0.10, humanitarian: 0.06, severity: 0.65, velocity: 0.95 },
  },
  {
    id: 'iraq-isis-2014',
    country: 'Iraq', period: 'Jun 2014', label: 'ISIS Mosul Offensive',
    summary: 'ISIS seized Mosul in 48 hours, capturing US military equipment. Rapid advance toward Baghdad. Iraqi army collapsed across the north.',
    outcome: 'One-third of Iraq under ISIS control within weeks. US re-intervention. 3-year counter-ISIS campaign.',
    trajectory: 'escalated', daysToOutcome: 7,
    features: { conflict: 0.90, political: 0.06, humanitarian: 0.05, severity: 0.78, velocity: 0.96 },
  },
  {
    id: 'haiti-2021',
    country: 'Haiti', period: 'Jul 2021', label: 'Presidential Assassination & State Fragility',
    summary: 'President Jovenel Moïse assassinated. Gang control expanded to cover 60% of Port-au-Prince. State effectively unable to govern.',
    outcome: 'State fragility deepened. Gang violence displaced 200,000 by 2023. International security mission authorized in 2023.',
    trajectory: 'collapse', daysToOutcome: 90,
    features: { conflict: 0.40, political: 0.48, humanitarian: 0.20, severity: 0.55, velocity: 0.55 },
  },
  {
    id: 'yemen-2014',
    country: 'Yemen', period: 'Sep 2014', label: 'Houthi Takeover of Sanaa',
    summary: 'Houthi forces seized the capital with limited resistance. President Hadi placed under house arrest. Saudi-led coalition intervened in March 2015.',
    outcome: '8+ year civil war. Largest humanitarian crisis globally. 24 million people in need of assistance.',
    trajectory: 'escalated', daysToOutcome: 180,
    features: { conflict: 0.75, political: 0.20, humanitarian: 0.08, severity: 0.68, velocity: 0.62 },
  },
  {
    id: 'venezuela-2019',
    country: 'Venezuela', period: 'Jan 2019', label: 'Guaidó Parallel Government Crisis',
    summary: 'Juan Guaidó declared himself interim president. Street clashes intensified. Military loyalty to Maduro held despite US recognition of Guaidó.',
    outcome: 'Maduro retained power. Humanitarian crisis deepened. 7 million Venezuelans emigrated by 2023.',
    trajectory: 'stabilized', daysToOutcome: 60,
    features: { conflict: 0.10, political: 0.85, humanitarian: 0.12, severity: 0.40, velocity: 0.55 },
  },
  {
    id: 'mali-2012',
    country: 'Mali', period: 'Jan–Mar 2012', label: 'Tuareg Rebellion & Military Coup',
    summary: 'MNLA Tuareg rebels, reinforced by AQIM-linked fighters from Libya, launched major offensive. Military coup in March compounded instability.',
    outcome: 'North Mali fell to rebel forces. French intervention (Operation Serval) in Jan 2013. Ongoing Sahel insurgency.',
    trajectory: 'escalated', daysToOutcome: 45,
    features: { conflict: 0.62, political: 0.35, humanitarian: 0.08, severity: 0.60, velocity: 0.62 },
  },
  {
    id: 'pakistan-2022',
    country: 'Pakistan', period: 'Oct 2022', label: 'PTI Long March & Constitutional Crisis',
    summary: 'Imran Khan led mass march on Islamabad after no-confidence removal. Assassination attempt in Wazirabad. Military and civilian government in open confrontation.',
    outcome: 'Protests dispersed. Khan arrested in May 2023. Political instability continued through elections.',
    trajectory: 'stabilized', daysToOutcome: 120,
    features: { conflict: 0.08, political: 0.88, humanitarian: 0.04, severity: 0.36, velocity: 0.62 },
  },
  {
    id: 'lebanon-2019',
    country: 'Lebanon', period: 'Oct 2019', label: 'October Revolution & Economic Collapse',
    summary: 'Mass protests erupted across Lebanon against the entire political class. Banks froze accounts. Currency collapsed by 90%. Government resigned.',
    outcome: 'Political deadlock for 13 months. Beirut port explosion August 2020. State effectively collapsed.',
    trajectory: 'collapse', daysToOutcome: 90,
    features: { conflict: 0.08, political: 0.80, humanitarian: 0.16, severity: 0.42, velocity: 0.70 },
  },
  {
    id: 'sudan-2019',
    country: 'Sudan', period: 'Dec 2018–Apr 2019', label: 'Al-Bashir Uprising',
    summary: 'Protests over bread prices escalated to calls for regime change. Security forces killed protesters. Military removed Bashir after 30 years.',
    outcome: 'Bashir ousted. Military-civilian transitional council formed. Democratic transition began but collapsed in 2021 coup.',
    trajectory: 'negotiated', daysToOutcome: 120,
    features: { conflict: 0.25, political: 0.72, humanitarian: 0.10, severity: 0.48, velocity: 0.68 },
  },
  {
    id: 'mozambique-cabo-2019',
    country: 'Mozambique', period: 'Oct 2019', label: 'Cabo Delgado Insurgency Escalation',
    summary: 'Al-Shabaab-linked insurgents (Ansar al-Sunna) launched coordinated attacks on Mocímboa da Praia and surrounding towns. Attack frequency tripled vs. prior year.',
    outcome: 'Insurgency spread across Cabo Delgado. LNG projects suspended. 1 million displaced. SADC mission deployed in 2021.',
    trajectory: 'escalated', daysToOutcome: 180,
    features: { conflict: 0.72, political: 0.12, humanitarian: 0.12, severity: 0.60, velocity: 0.50 },
  },
  {
    id: 'somalia-2022',
    country: 'Somalia', period: 'May 2022', label: 'Al-Shabaab Offensive Surge',
    summary: 'Al-Shabaab launched its largest offensive in years, temporarily seizing towns in Hiraan and Middle Shabelle regions.',
    outcome: 'Offensive repelled with Ethiopian/ATMIS support. Government counter-offensive began August 2022.',
    trajectory: 'stabilized', daysToOutcome: 90,
    features: { conflict: 0.80, political: 0.10, humanitarian: 0.10, severity: 0.65, velocity: 0.70 },
  },
]
