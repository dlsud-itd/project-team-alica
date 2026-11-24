export interface CategoryDefinition {
  id: string;
  name: string;
  domain: 'Technology' | 'Academic' | 'Campus Life' | 'Sports' | 'Arts & Social' | 'Other';
  suggestedTags: string[];
}

export const EVENT_DOMAINS = [
  'Technology',
  'Academic',
  'Campus Life',
  'Sports',
  'Arts & Social',
] as const;

export const STANDARD_EVENT_CATEGORIES: CategoryDefinition[] = [
  // Technology & Innovation
  {
    id: 'Conference',
    name: 'Conference',
    domain: 'Technology',
    suggestedTags: ['Keynote', 'Tech', 'Networking', 'Industry', 'Research'],
  },
  {
    id: 'Hackathon',
    name: 'Hackathon',
    domain: 'Technology',
    suggestedTags: ['Coding', '24-Hour', 'Prizes', 'Team', 'Prototypes'],
  },
  {
    id: 'Workshop',
    name: 'Workshop',
    domain: 'Technology',
    suggestedTags: ['Hands-on', 'Interactive', 'Beginners', 'Advanced', 'Skill-building'],
  },
  {
    id: 'Expo',
    name: 'Expo / Showcase',
    domain: 'Technology',
    suggestedTags: ['Demos', 'Projects', 'Startups', 'Exhibition', 'Booths'],
  },
  {
    id: 'Meetup',
    name: 'Meetup',
    domain: 'Technology',
    suggestedTags: ['Community', 'Discussion', 'Lightning Talks', 'Casual'],
  },

  // Academic & Research
  {
    id: 'Seminar',
    name: 'Seminar / Lecture',
    domain: 'Academic',
    suggestedTags: ['Guest Speaker', 'Academic', 'Research', 'Colloquium'],
  },
  {
    id: 'Defense',
    name: 'Thesis Defense',
    domain: 'Academic',
    suggestedTags: ['Undergraduate', 'Graduate', 'Formal', 'Research'],
  },
  {
    id: 'Panel',
    name: 'Panel Discussion',
    domain: 'Academic',
    suggestedTags: ['Q&A', 'Industry Leaders', 'Debate', 'Panelists'],
  },

  // Campus & Student Life
  {
    id: 'General Assembly',
    name: 'General Assembly',
    domain: 'Campus Life',
    suggestedTags: ['Student Org', 'Elections', 'Reports', 'Membership'],
  },
  {
    id: 'Orientation',
    name: 'Orientation',
    domain: 'Campus Life',
    suggestedTags: ['Freshmen', 'Welcome', 'Campus Tour', 'Academics'],
  },
  {
    id: 'Club Fair',
    name: 'Club / Org Fair',
    domain: 'Campus Life',
    suggestedTags: ['Recruitment', 'Organizations', 'Booths', 'Sign-up'],
  },

  // Sports & Recreation
  {
    id: 'Tournament',
    name: 'Tournament',
    domain: 'Sports',
    suggestedTags: ['Basketball', 'Volleyball', 'Athletics', 'Championship'],
  },
  {
    id: 'Esports',
    name: 'Esports',
    domain: 'Sports',
    suggestedTags: ['Valorant', 'MLBB', 'Gaming', 'Prizes', 'Championship'],
  },

  // Arts, Culture & Social
  {
    id: 'Cultural',
    name: 'Cultural Showcase',
    domain: 'Arts & Social',
    suggestedTags: ['Music', 'Dance', 'Theater', 'Performance'],
  },
  {
    id: 'Concert',
    name: 'Concert / Gig',
    domain: 'Arts & Social',
    suggestedTags: ['Live Band', 'Music', 'Night Event', 'Festival'],
  },
  {
    id: 'Social',
    name: 'Mixer / Social',
    domain: 'Arts & Social',
    suggestedTags: ['Networking', 'Games', 'Socials', 'Party'],
  },
];

export function normalizeCategoryName(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return 'General';
  const trimmed = raw.trim();
  const match = STANDARD_EVENT_CATEGORIES.find(
    (c) =>
      c.id.toLowerCase() === trimmed.toLowerCase() ||
      c.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match.name;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
