// src/data/categories.js
// Starter category set — seeded into the categories table on first load if
// it's empty. After that it's fully user-editable (add / rename / recolor /
// delete) from Settings → Categories, and this list is never consulted again.
// Merges the old hardcoded commitment categories and recurring-task tags into
// one shared list.
export const DEFAULT_CATEGORIES = [
  { id:'lab',      label:'Lab',      color:'#059669', sortOrder:0 },
  { id:'class',    label:'Class',    color:'#7C3AED', sortOrder:1 },
  { id:'study',    label:'Study',    color:'#7A8EC4', sortOrder:2 },
  { id:'meeting',  label:'Meeting',  color:'#4A9EB5', sortOrder:3 },
  { id:'deadline', label:'Deadline', color:'#C4728E', sortOrder:4 },
  { id:'career',   label:'Career',   color:'#D97706', sortOrder:5 },
  { id:'health',   label:'Health',   color:'#E07B2E', sortOrder:6 },
  { id:'fitness',  label:'Fitness',  color:'#3B82F6', sortOrder:7 },
  { id:'personal', label:'Personal', color:'#A855F7', sortOrder:8 },
  { id:'social',   label:'Social',   color:'#9A7CC4', sortOrder:9 },
  { id:'urgent',   label:'Urgent',   color:'#EF4444', sortOrder:10 },
  { id:'sleep',    label:'Sleep',    color:'#52B788', sortOrder:11 },
  { id:'other',    label:'Other',    color:'#8899AA', sortOrder:12 },
]
