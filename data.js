/*
 * The table from "Artery Irrigation Regions (Precise)": every artery with the regions it
 * irrigates, in the document's order. Each region is one row of the game's table.
 *
 * branchOf: the artery a sub-branch comes off (shown above its name, like "(Lingual)" in
 * the document). Where the document lists several regions in one cell, they are separate
 * regions here.
 *
 * The same region can appear under more than one artery (SCM muscle, Suprahyoid muscles,
 * Tongue, Floor of mouth, Soft palate, Face, Parotid gland duct..., Temporalis muscle).
 * In the game those cards are interchangeable: any copy can go to any artery that has it.
 *
 * To change the content, edit the lists below. Nothing else needs to change.
 */
window.IRRIGATION = [
  {
    group: 'Branches of the external carotid artery',
    arteries: [
      { name: 'Superior Thyroid Artery', regions: ['Infrahyoid muscles', 'SCM muscle', 'Larynx', 'Thyroid gland'] },

      { name: 'Lingual Artery', regions: ['Suprahyoid muscles', 'Tissue superior to the hyoid bone', 'Tongue', 'Floor of mouth'] },
      { name: 'Sublingual Artery', branchOf: 'lingual', regions: ['Sublingual salivary glands', 'Mylohyoid muscle', 'Mucous membrane on the floor of the mouth'] },
      { name: 'Deep Lingual Artery', branchOf: 'lingual', regions: ['Tongue'] },
      { name: 'Suprahyoid Artery', branchOf: 'lingual', regions: ['Suprahyoid muscles'] },

      { name: 'Ascending Palatine Artery', branchOf: 'facial', regions: ['Soft palate', 'Palatine muscles/tonsils'] },
      { name: 'Submental Artery', branchOf: 'facial', regions: ['Submandibular lymph nodes'] },
      { name: 'Facial Artery', regions: ['Face', 'Zygomatic area', 'Nasal area', 'Infraorbital rim', 'Orbital regions', 'Mylohyoid & digastric muscles', 'Submandibular salivary glands', 'Muscles of facial expression'] },
      { name: 'Superior Labial Artery', branchOf: 'facial', regions: ['Upper lips'] },
      { name: 'Inferior Labial Artery', branchOf: 'facial', regions: ['Lower lips'] },
      { name: 'Angular Artery', branchOf: 'facial', regions: ['Side of nose'] },

      { name: 'Ascending Pharyngeal Artery', regions: ['Pharyngeal walls', 'Soft palate', 'Meninges of Brain'] },
      { name: 'Occipital Artery', regions: ['Suprahyoid muscles', 'SCM muscle', 'Occipital scalp & meninges'] },
      { name: 'Posterior Auricular Artery', regions: ['Inner ear', 'Mastoid air cells'] },

      { name: 'Superficial Temporal Artery', regions: ['Parotid gland duct & nearby facial tissues', 'Temporalis muscle', 'Frontal & parietal scalp'] },
      { name: 'Transverse Facial Artery', branchOf: 'superficial temporal', regions: ['Parotid gland duct & nearby facial tissues'] },
      { name: 'Middle Temporal Artery', branchOf: 'superficial temporal', regions: ['Temporal muscles'] },
      { name: 'Frontal Branch', branchOf: 'superficial temporal', regions: ['Frontal scalp'] },
      { name: 'Parietal Branch', branchOf: 'superficial temporal', regions: ['Parietal scalp'] }
    ]
  },
  {
    group: 'Branches of the maxillary artery',
    arteries: [
      { name: 'Middle Meningeal Artery', regions: ['Meninges via Foramen Spinosum'] },
      { name: 'Inferior Alveolar Artery', regions: ['Mandibular teeth & periodontium', 'Floor of mouth', 'Mental region', 'Mylohyoid'] },
      { name: 'Deep Temporal Artery', regions: ['Temporalis muscle'] },
      { name: 'Pterygoid Artery', regions: ['Lateral & medial pterygoid muscle'] },
      { name: 'Masseteric Artery', regions: ['Masseter muscle'] },
      { name: 'Buccal Artery', regions: ['Buccinator & buccal region'] },
      { name: 'Posterior Superior Alveolar Artery', regions: ['Posterior maxillary teeth & periodontium', 'Maxillary sinus'] },
      { name: 'Infraorbital Artery', regions: ['Orbital region', 'Face', 'Anterior maxillary teeth & periodontium'] },
      { name: 'Greater Palatine Artery', regions: ['Hard & soft palates'] },
      { name: 'Sphenopalatine Artery', regions: ['Nasal cavity & anterior hard palate'] }
    ]
  }
];

/*
 * Different wording for the same structure. The game treats each set as one region, so
 * any of these cards fits any artery that has one of them (and the row then shows that
 * artery's own wording from the table).
 */
window.IRRIGATION_SAME = [
  ['Mylohyoid', 'Mylohyoid muscle'],
  ['Orbital region', 'Orbital regions'],
  ['Temporalis muscle', 'Temporal muscles']
];
