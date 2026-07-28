import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTasteQuery, rankLocalCandidates } from '../server/services/movieRecommender.js';

test('buildTasteQuery includes onboarding preferences and positive history', () => {
  const query = buildTasteQuery({
    onboarding: {
      favoriteGenres: ['Drama'],
      favoriteMoods: ['contemplativo'],
      preferredPace: 'lento',
      favoriteMovies: 'A Chegada',
    },
    interactions: [
      { eventType: 'liked', movieTitle: 'Interestelar' },
      { eventType: 'disliked', movieTitle: 'Corra!' },
    ],
  });

  assert.match(query, /Drama/);
  assert.match(query, /contemplativo/);
  assert.match(query, /Interestelar/);
  assert.doesNotMatch(query, /Corra!/);
});

test('rankLocalCandidates favors genre and mood overlap', () => {
  const movies = [
    {
      id: 'a',
      title: 'A',
      genres: ['Drama'],
      moods: ['contemplativo'],
      pace: 'lento',
      language: 'Inglês',
      synopsis: '',
      communityScore: 80,
    },
    {
      id: 'b',
      title: 'B',
      genres: ['Ação'],
      moods: ['frenético'],
      pace: 'rápido',
      language: 'Inglês',
      synopsis: '',
      communityScore: 90,
    },
  ];

  const [first] = rankLocalCandidates(movies, {
    onboarding: {
      favoriteGenres: ['Drama'],
      favoriteMoods: ['contemplativo'],
      preferredPace: 'lento',
    },
    interactions: [],
  });

  assert.equal(first.movieId, 'a');
});

test('rankLocalCandidates matches legacy preferences without accents', () => {
  const movies = [
    {
      id: 'accented',
      title: 'A',
      genres: ['Ficção científica', 'Ação'],
      moods: ['frenético'],
      pace: 'rápido',
      language: 'Inglês',
      synopsis: '',
      communityScore: 80,
    },
    {
      id: 'other',
      title: 'B',
      genres: ['Drama'],
      moods: ['contemplativo'],
      pace: 'lento',
      language: 'Francês',
      synopsis: '',
      communityScore: 90,
    },
  ];

  const [first] = rankLocalCandidates(movies, {
    onboarding: {
      favoriteGenres: ['Ficcao cientifica', 'Acao'],
      favoriteMoods: ['frenetico'],
      preferredPace: 'rapido',
      favoriteLanguages: ['Ingles'],
    },
    interactions: [],
  });

  assert.equal(first.movieId, 'accented');
});
