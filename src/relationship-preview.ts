/// <reference types="vite/client" />
// Requested presentation values. Set VITE_RELATIONSHIP_PREVIEW=false to use saved activity.
export const relationshipPreview = import.meta.env.VITE_RELATIONSHIP_PREVIEW !== 'false' ? {
 week: {isDemo: true, summary: {minutes: 521, activeDays: 6, favoriteCount: 2}},
 spark: {value: 161, minutes: 520, songs: 99, diaries: 7, next: 200},
} : null;
