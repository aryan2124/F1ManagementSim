/**
 * The real championship record, 1950 to 2025: World Drivers' Champions (with the team they won with) and World
 * Constructors' Champions (the title began in 1958). Compiled from Wikipedia's lists of Formula One World Drivers'
 * Champions and World Constructors' Champions, read on 17 Oct 2026.
 */
export const REAL_SOURCES = [
  { label: "List of Formula One World Drivers' Champions (Wikipedia)", url: "https://en.wikipedia.org/wiki/List_of_Formula_One_World_Drivers%27_Champions" },
  { label: "List of Formula One World Constructors' Champions (Wikipedia)", url: "https://en.wikipedia.org/wiki/List_of_Formula_One_World_Constructors%27_Champions" },
];

export const REAL_WDC: [number, string, string][] = [
  [1950, "Giuseppe Farina", "Alfa Romeo"], [1951, "Juan Manuel Fangio", "Alfa Romeo"], [1952, "Alberto Ascari", "Ferrari"], [1953, "Alberto Ascari", "Ferrari"],
  [1954, "Juan Manuel Fangio", "Maserati"], [1955, "Juan Manuel Fangio", "Mercedes"], [1956, "Juan Manuel Fangio", "Ferrari"], [1957, "Juan Manuel Fangio", "Maserati"],
  [1958, "Mike Hawthorn", "Ferrari"], [1959, "Jack Brabham", "Cooper"], [1960, "Jack Brabham", "Cooper"], [1961, "Phil Hill", "Ferrari"],
  [1962, "Graham Hill", "BRM"], [1963, "Jim Clark", "Lotus"], [1964, "John Surtees", "Ferrari"], [1965, "Jim Clark", "Lotus"],
  [1966, "Jack Brabham", "Brabham"], [1967, "Denny Hulme", "Brabham"], [1968, "Graham Hill", "Lotus"], [1969, "Jackie Stewart", "Matra"],
  [1970, "Jochen Rindt", "Lotus"], [1971, "Jackie Stewart", "Tyrrell"], [1972, "Emerson Fittipaldi", "Lotus"], [1973, "Jackie Stewart", "Tyrrell"],
  [1974, "Emerson Fittipaldi", "McLaren"], [1975, "Niki Lauda", "Ferrari"], [1976, "James Hunt", "McLaren"], [1977, "Niki Lauda", "Ferrari"],
  [1978, "Mario Andretti", "Lotus"], [1979, "Jody Scheckter", "Ferrari"], [1980, "Alan Jones", "Williams"], [1981, "Nelson Piquet", "Brabham"],
  [1982, "Keke Rosberg", "Williams"], [1983, "Nelson Piquet", "Brabham"], [1984, "Niki Lauda", "McLaren"], [1985, "Alain Prost", "McLaren"],
  [1986, "Alain Prost", "McLaren"], [1987, "Nelson Piquet", "Williams"], [1988, "Ayrton Senna", "McLaren"], [1989, "Alain Prost", "McLaren"],
  [1990, "Ayrton Senna", "McLaren"], [1991, "Ayrton Senna", "McLaren"], [1992, "Nigel Mansell", "Williams"], [1993, "Alain Prost", "Williams"],
  [1994, "Michael Schumacher", "Benetton"], [1995, "Michael Schumacher", "Benetton"], [1996, "Damon Hill", "Williams"], [1997, "Jacques Villeneuve", "Williams"],
  [1998, "Mika Häkkinen", "McLaren"], [1999, "Mika Häkkinen", "McLaren"], [2000, "Michael Schumacher", "Ferrari"], [2001, "Michael Schumacher", "Ferrari"],
  [2002, "Michael Schumacher", "Ferrari"], [2003, "Michael Schumacher", "Ferrari"], [2004, "Michael Schumacher", "Ferrari"], [2005, "Fernando Alonso", "Renault"],
  [2006, "Fernando Alonso", "Renault"], [2007, "Kimi Räikkönen", "Ferrari"], [2008, "Lewis Hamilton", "McLaren"], [2009, "Jenson Button", "Brawn"],
  [2010, "Sebastian Vettel", "Red Bull"], [2011, "Sebastian Vettel", "Red Bull"], [2012, "Sebastian Vettel", "Red Bull"], [2013, "Sebastian Vettel", "Red Bull"],
  [2014, "Lewis Hamilton", "Mercedes"], [2015, "Lewis Hamilton", "Mercedes"], [2016, "Nico Rosberg", "Mercedes"], [2017, "Lewis Hamilton", "Mercedes"],
  [2018, "Lewis Hamilton", "Mercedes"], [2019, "Lewis Hamilton", "Mercedes"], [2020, "Lewis Hamilton", "Mercedes"], [2021, "Max Verstappen", "Red Bull"],
  [2022, "Max Verstappen", "Red Bull"], [2023, "Max Verstappen", "Red Bull"], [2024, "Max Verstappen", "Red Bull"], [2025, "Lando Norris", "McLaren"],
];

export const REAL_WCC_LIST: [number, string][] = [
  [1958, "Vanwall"], [1959, "Cooper"], [1960, "Cooper"], [1961, "Ferrari"], [1962, "BRM"], [1963, "Lotus"], [1964, "Ferrari"], [1965, "Lotus"],
  [1966, "Brabham"], [1967, "Brabham"], [1968, "Lotus"], [1969, "Matra"], [1970, "Lotus"], [1971, "Tyrrell"], [1972, "Lotus"], [1973, "Lotus"],
  [1974, "McLaren"], [1975, "Ferrari"], [1976, "Ferrari"], [1977, "Ferrari"], [1978, "Lotus"], [1979, "Ferrari"], [1980, "Williams"], [1981, "Williams"],
  [1982, "Ferrari"], [1983, "Ferrari"], [1984, "McLaren"], [1985, "McLaren"], [1986, "Williams"], [1987, "Williams"], [1988, "McLaren"], [1989, "McLaren"],
  [1990, "McLaren"], [1991, "McLaren"], [1992, "Williams"], [1993, "Williams"], [1994, "Williams"], [1995, "Benetton"], [1996, "Williams"], [1997, "Williams"],
  [1998, "McLaren"], [1999, "Ferrari"], [2000, "Ferrari"], [2001, "Ferrari"], [2002, "Ferrari"], [2003, "Ferrari"], [2004, "Ferrari"], [2005, "Renault"],
  [2006, "Renault"], [2007, "Ferrari"], [2008, "Ferrari"], [2009, "Brawn"], [2010, "Red Bull"], [2011, "Red Bull"], [2012, "Red Bull"], [2013, "Red Bull"],
  [2014, "Mercedes"], [2015, "Mercedes"], [2016, "Mercedes"], [2017, "Mercedes"], [2018, "Mercedes"], [2019, "Mercedes"], [2020, "Mercedes"], [2021, "Mercedes"],
  [2022, "Red Bull"], [2023, "Red Bull"], [2024, "McLaren"], [2025, "McLaren"],
];

/** Titles per driver, counted from the list above. */
export function realTitleCount(name: string): number {
  return REAL_WDC.filter((x) => x[1] === name).length;
}
