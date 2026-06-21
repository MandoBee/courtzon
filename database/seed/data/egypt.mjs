// Egyptian-centric data for CourtZon-V2 seed system

export const EGYPTIAN_CITIES = [
  { city: 'Cairo', lat: 30.0444, lng: 31.2357, timezone: 'Africa/Cairo' },
  { city: 'Alexandria', lat: 31.2001, lng: 29.9187, timezone: 'Africa/Cairo' },
  { city: 'Giza', lat: 30.0131, lng: 31.2089, timezone: 'Africa/Cairo' },
  { city: 'Sharm El Sheikh', lat: 27.9158, lng: 34.3299, timezone: 'Africa/Cairo' },
  { city: 'Hurghada', lat: 27.2579, lng: 33.8116, timezone: 'Africa/Cairo' },
  { city: 'Luxor', lat: 25.6872, lng: 32.6396, timezone: 'Africa/Cairo' },
  { city: 'Mansoura', lat: 31.0409, lng: 31.3785, timezone: 'Africa/Cairo' },
  { city: 'Tanta', lat: 30.7865, lng: 31.0004, timezone: 'Africa/Cairo' },
  { city: 'Ismailia', lat: 30.6043, lng: 32.2722, timezone: 'Africa/Cairo' },
  { city: 'Port Said', lat: 31.2653, lng: 32.3019, timezone: 'Africa/Cairo' },
  { city: 'Suez', lat: 29.9668, lng: 32.5498, timezone: 'Africa/Cairo' },
  { city: 'Dahab', lat: 28.4940, lng: 34.4381, timezone: 'Africa/Cairo' },
]

export const EGYPTIAN_NAMES = {
  male: [
    'Mohamed', 'Ahmed', 'Mahmoud', 'Ali', 'Hassan', 'Hussein', 'Omar', 'Khaled',
    'Youssef', 'Ibrahim', 'Amr', 'Tarek', 'Hany', 'Samer', 'Karim', 'Nabil',
    'Adel', 'Ashraf', 'Wael', 'Emad', 'Sherif', 'Moustafa', 'Gamal', 'Hesham',
    'Ayman', 'Salah', 'Ramy', 'Maged', 'Raouf', 'Fady', 'Ziad', 'Seif',
    'Yassin', 'Adam', 'Yahya', 'Ehab', 'Nader', 'Sameh', 'Tamer', 'Hatem',
  ],
  female: [
    'Nour', 'Mariam', 'Fatima', 'Sara', 'Heba', 'Dina', 'Mona', 'Laila',
    'Nada', 'Salma', 'Rania', 'Yasmin', 'Amira', 'Marwa', 'Reem', 'Aya',
    'Hoda', 'Samar', 'Ghada', 'Manal', 'Nihal', 'Rasha', 'Shaimaa', 'Eman',
    'Nermine', 'Mai', 'Omnia', 'Maha', 'Hend', 'Noha', 'Donia', 'Habiba',
    'Malak', 'Farida', 'Kenzy', 'Lilian', 'Jana', 'Mariam', 'Rita', 'Nadia',
  ],
  last: [
    'El Sayed', 'Hassan', 'Ali', 'Ibrahim', 'Mohamed', 'Ahmed', 'Mahmoud',
    'Saleh', 'Youssef', 'Khalil', 'Abdel Rahman', 'Mostafa', 'Fahmy', 'Hussein',
    'Sadek', 'Galal', 'Osman', 'Shaker', 'Naguib', 'El Deeb', 'Samy',
    'Rashwan', 'El Sherbiny', 'El Masry', 'Shalaby', 'El Gammal', 'El Desouky',
    'Abdou', 'El Sharkawy', 'Mansour', 'El Gohary', 'Fouad', 'El Saadany',
    'Badawy', 'El Kady', 'El Shazly', 'El Nagar', 'El Hawary', 'Shaheen', 'El Shamy',
  ],
}

export const EGYPTIAN_CLUBS = [
  { name: 'نادي الجزيرة الرياضي', name_en: 'Gezeta Sporting Club', desc: 'One of Egypt\'s oldest and most prestigious sports clubs in Zamalek, Cairo', city: 'Cairo' },
  { name: 'نادي وادي دجلة', name_en: 'Wadi Degla Sporting Club', desc: 'Modern multi-sport complex with world-class tennis and padel facilities', city: 'Cairo' },
  { name: 'نادي سموحة', name_en: 'Smouha Sporting Club', desc: 'Premier sports club in Alexandria overlooking the Mediterranean', city: 'Alexandria' },
  { name: 'نادي الشمس', name_en: 'Shams Sporting Club', desc: 'Historic heliopolis club known for its football and tennis academies', city: 'Cairo' },
  { name: 'أكاديمية بلاك بول', name_en: 'Black Ball Academy', desc: 'Premium sports academy in New Cairo with international-standard facilities', city: 'Cairo' },
  { name: 'نادي اتحاد الشرطة', name_en: 'Police Union Club', desc: 'Large multi-purpose sports complex on the Cairo-Alexandria desert road', city: 'Giza' },
  { name: 'نادي سبورتنج', name_en: 'Sporting Club', desc: 'Historic Alexandria club with tennis, squash and swimming facilities', city: 'Alexandria' },
  { name: 'نادي الرواد', name_en: 'El Rawad Sporting Club', desc: 'Family-oriented sports club in Sheikh Zayed with padel and football', city: 'Giza' },
]

export const SPORTS_LIST = [
  { id: 1, name: 'Football', slug: 'football', icon: 'soccer' },
  { id: 2, name: 'Padel', slug: 'padel', icon: 'padel' },
  { id: 3, name: 'Tennis', slug: 'tennis', icon: 'tennis' },
  { id: 4, name: 'Basketball', slug: 'basketball', icon: 'basketball' },
  { id: 5, name: 'Volleyball', slug: 'volleyball', icon: 'volleyball' },
  { id: 6, name: 'Squash', slug: 'squash', icon: 'squash' },
  { id: 7, name: 'Swimming', slug: 'swimming', icon: 'swimming' },
  { id: 8, name: 'Boxing', slug: 'boxing', icon: 'boxing' },
  { id: 9, name: 'Martial Arts', slug: 'martial-arts', icon: 'martial-arts' },
]

export const BRANCH_SUFFIXES = ['Main Branch', 'North Branch', 'South Branch', 'East Branch', 'West Branch', 'Premier Branch', 'Elite Branch', 'Academy Branch']
export const RESOURCE_TYPES = ['court', 'pool', 'jacuzzi', 'treatment_room', 'fitness_zone', 'yoga_studio', 'multi_purpose_hall']
