// src/data/flashcards.js
// ─────────────────────────────────────────────────────────────
// THIS IS THE ONLY FILE CLAUDE EDITS FOR FLASHCARD CONTENT.
// Never touch any component file to add flashcards.
// Each card: { id, term, def, topic, dateAdded, imgSrc? }
// imgSrc can be a URL (must be 100% certain of accuracy)
// or a base64 data URI from extracted pptx images.
// ─────────────────────────────────────────────────────────────

export const STUDY_SETS = [
  {
    classId: 'coral',
    className: 'BIOL 505 — Coral Reef Environments',
    weeks: [
      {
        weekId: 'W1',
        weekLabel: 'Week 1 — Intro & Tropical Oceanography',
        files: [],
        cards: [
          // ── ID: Corals ─────────────────────────────────────
          { id:'cr-w1-001', term:'Branching Fire Coral',       def:'Millepora alcicornis. Hydrozoa, Anthoathecata. Not a true stony coral — a hydrozoan that resembles coral. Branching form with smooth surface and tiny pores.',       topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-002', term:'Blade Fire Coral',           def:'Millepora complanata. Hydrozoa. Blade/plate-shaped form of fire coral. Causes intense burning sting on contact.',                                                    topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-003', term:'Common Sea Fan',             def:'Gorgonia ventalina. Octocorallia (soft coral). Large fan-shaped gorgonian, purple or yellow. Filter feeder oriented perpendicular to current.',                     topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-004', term:'Staghorn Coral',             def:'Acropora cervicornis. Scleractinia. Branching stony coral with cylindrical branches. Critically endangered. Fast-growing but fragile.',                             topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-005', term:'Elkhorn Coral',              def:'Acropora palmata. Scleractinia. Broad, flat, elkhorn-shaped branches. Critically endangered. Keystone reef-builder in shallow Caribbean reefs.',                    topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-006', term:'Club-tip Finger Coral',      def:'Porites porites. Scleractinia. Stubby, club-tipped branches. Common encrusting or branching form.',                                                                  topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-007', term:'Thin Finger Coral',          def:'Porites divaricata. Scleractinia. Thin, elongated branching fingers. Similar to P. porites but more slender.',                                                       topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-008', term:'Pillar Coral',               def:'Dendrogyra cylindrus. Scleractinia. Tall upright cylindrical columns with fuzzy texture (extended polyps visible during day). Rare and vulnerable.',               topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-009', term:'Tube Coral',                 def:'Cladocora arbuscula. Scleractinia. Small branching coral forming tufts or tubes. Less common.',                                                                       topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-010', term:'Mountainous Star Coral',     def:'Orbicella annularis. Scleractinia. Large mounding/boulder coral with distinctive pattern of star-shaped corallites. Major reef-builder.',                           topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-011', term:'Great Star Coral',           def:'Montastraea cavernosa. Scleractinia. Large polyps visible as bumps on surface. Mounding to encrusting form. Common at depth.',                                     topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-012', term:'Golfball Coral',             def:'Favia fragum. Scleractinia. Small, round, solitary or colonial. Looks like a golf ball. Very common in shallow water.',                                            topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-013', term:'Mustard Hill Coral',         def:'Porites astreoides. Scleractinia. Encrusting or mounding, pale yellow-green. One of the most common Caribbean corals. Tolerates poor conditions.',                 topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-014', term:'Massive Starlet Coral',      def:'Siderastrea siderea. Scleractinia. Massive boulder form with fine starlet-pattern corallites. Very common, tolerant of turbid water.',                             topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-015', term:'Lesser Starlet Coral',       def:'Siderastrea radians. Scleractinia. Smaller than S. siderea. Encrusting plates with fine pattern. Common in shallow lagoons.',                                      topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-016', term:'Symmetrical Brain Coral',    def:'Pseudodiploria strigosa. Scleractinia. Classic brain-coral appearance with symmetrical valley-ridge pattern. Very common.',                                         topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-017', term:'Knobby Brain Coral',         def:'Pseudodiploria clivosa. Scleractinia. Similar to P. strigosa but with raised knobs between valleys. Less smooth.',                                                  topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-018', term:'Grooved Brain Coral',        def:'Diploria labyrinthiformis. Scleractinia. Deep, narrow grooves forming labyrinthine pattern. Columellae visible in valleys.',                                        topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-019', term:'Maze Coral',                 def:'Meandrina meandrites. Scleractinia. Broad meandering valleys with tall ridges. Looks like a maze. Common at moderate depth.',                                      topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-020', term:'Rose Coral',                 def:'Manicina areolata. Scleractinia. Solitary free-living coral. Oval shape with radiating pattern. Found on sandy bottoms.',                                          topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-021', term:'Giant Brain Coral',          def:'Colpophyllia natans. Scleractinia. Large brain coral with wide, deep valleys and a groove along the top of each ridge. Can grow very large.',                      topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-022', term:'Lettuce Coral',              def:'Agaricia agaricites. Scleractinia. Thin overlapping plates or encrusting. Looks like lettuce leaves. Common in shaded areas.',                                     topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-023', term:'Ridged Cactus Coral',        def:'Mycetophyllia lamarckiana. Scleractinia. Fleshy coral with prominent ridges. Surface looks like a cactus. Irregular valleys.',                                     topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-024', term:'Sinuous Cactus Coral',       def:'Isophyllia sinuosa. Scleractinia. Fleshy with sinuous (wavy) valleys. Large polyps. Fewer, broader valleys than other fleshy corals.',                            topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-025', term:'Rough Star Coral',           def:'Isophyllia rigida. Scleractinia. Fleshy coral with a rough, irregular surface and prominent star-shaped corallites.',                                              topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-026', term:'Smooth Flower Coral',        def:'Eusmilia fastigiata. Scleractinia. Branching coral with large, smooth, round polyp heads at branch tips. Looks like flowers.',                                    topic:'ID: Corals', dateAdded:'2026-03-30', imgSrc:null },
          // ── ID: Algae ──────────────────────────────────────
          { id:'cr-w1-027', term:'Encrusting Coralline Algae', def:'Crustose coralline algae (CCA). Pink/purple calcareous crust on reef surfaces. Essential for reef consolidation and larval settlement cues.',                     topic:'ID: Algae', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-028', term:'Turf Algae',                 def:'Mixed assemblage of short filamentous algae forming a "turf." Competes with corals for space. Increases with eutrophication.',                                    topic:'ID: Algae', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-029', term:'Encrusting Fan-leaf Alga',   def:'Lobophora variegata. Brown macroalga. Fan-shaped or encrusting. Common on degraded reefs. Outcompetes corals when nutrients are high.',                           topic:'ID: Algae', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-030', term:'Halimeda / Lettuce Algae',   def:'Halimeda sp. Calcareous green alga. Segmented, plate-like. Major contributor to reef sediment. Looks like watercress or lettuce.',                               topic:'ID: Algae', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-031', term:'Turtle Grass',               def:'Thalassia testudinum. Seagrass (not an alga). Long flat blades. Important nursery habitat. Indicator of calm, shallow water.',                                    topic:'ID: Algae', dateAdded:'2026-03-30', imgSrc:null },
          // ── Concepts ───────────────────────────────────────
          { id:'cr-w1-032', term:'Coral Reef Zones',           def:'Fore reef (high energy, high diversity) → Reef crest (spur & groove) → Back reef / Lagoon (low energy). Zonation driven by light, wave energy, and sedimentation.', topic:'Concepts', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-033', term:'Zooxanthellae',              def:'Symbiodinium spp. — photosynthetic dinoflagellates living in coral tissue. Provide up to 90% of coral energy via photosynthesis. Lost during bleaching.',         topic:'Concepts', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-034', term:'Coral Bleaching',            def:'Expulsion of zooxanthellae due to thermal stress, leaving white skeleton visible. Coral survives briefly but starves if stress doesn\'t resolve.',                topic:'Concepts', dateAdded:'2026-03-30', imgSrc:null },
          { id:'cr-w1-035', term:'Tropical Oceanography — Trade Winds', def:'Easterly trade winds drive surface currents in tropics. Create upwelling on western coasts of continents. Critical to Caribbean reef connectivity.',  topic:'Concepts', dateAdded:'2026-03-30', imgSrc:null },
        ]
      },
      {
        weekId: 'W2',
        weekLabel: 'Week 2 — Reef Communities',
        files: [],
        cards: []
      },
    ]
  },
  {
    classId: 'ecol',
    className: 'BIOL 433 — Ecological Energetics',
    weeks: [
      { weekId: 'W1', weekLabel: 'Week 1', files: [
        { name:'01_CoralReefs.pptx.pdf', type:'pdf', addedDate:'2026-03-31' },
        { name:'02_coralreefs.pptx.pdf', type:'pdf', addedDate:'2026-03-31' },
      ], cards: [] },
    ]
  },
  {
    classId: 'capstone',
    className: 'BIOL 651 — Capstone II',
    weeks: [
      { weekId: 'W1', weekLabel: 'Week 1 — BioFest Project', files: [], cards: [] },
    ]
  },
  {
    classId: 'yeast',
    className: 'Yeast Thesis Research',
    weeks: [
      { weekId: 'W1', weekLabel: 'Ongoing', files: [], cards: [] },
    ]
  },
]
