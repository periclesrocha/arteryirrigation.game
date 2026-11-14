/*
 * The table from "Artery Irrigation Regions": every artery with the regions it irrigates,
 * in the document's order. Each region is one row of the table (43 rows in all).
 *
 * The same region can appear under more than one artery (SCM muscle, Floor of mouth,
 * Soft palate, Temporalis muscle). In the game those cards are interchangeable: either
 * "SCM muscle" card can go to either artery that supplies it.
 *
 * To change the content, edit the lists below. Nothing else needs to change.
 */
window.IRRIGATION = [
  {
    group: 'Branches of the external carotid artery',
    arteries: [
      { name: 'Superior Thyroid Artery', regions: ['Infrahyoid muscles', 'SCM muscle', 'Larynx', 'Thyroid gland'] },
      { name: 'Lingual Artery', regions: ['Suprahyoid & mylohyoid muscles', 'Sublingual salivary glands', 'Floor of mouth', 'Tongue'] },
      { name: 'Facial Artery', regions: ['Soft palate', 'Palatine muscles/tonsils', 'Submandibular gland/lymph nodes', 'Mylohyoid & digastric muscles', 'Upper lips', 'Lower lips', 'Facial expression muscles', 'Side of nose'] },
      { name: 'Ascending Pharyngeal Artery', regions: ['Pharyngeal walls', 'Soft palate', 'Meninges of Brain'] },
      { name: 'Occipital Artery', regions: ['Suprahyoid muscles', 'SCM muscle', 'Occipital scalp & meninges'] },
      { name: 'Posterior Auricular Artery', regions: ['Inner ear', 'Mastoid air cells'] },
      { name: 'Superficial Temporal Artery', regions: ['Parotid gland duct & nearby facial tissues', 'Temporalis muscle', 'Frontal & parietal scalp'] }
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
