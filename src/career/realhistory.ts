/**
 * The invented championship record, 1950 to 2025: Drivers' Champions (with the team they won with) and
 * Constructors' Champions (the title began in 1958). Every name here is made up for the game. The recent
 * years line up with the careers of the drivers and teams in the starting grid.
 */
export const REAL_SOURCES: { label: string; url: string }[] = [];

export const REAL_WDC: [number, string, string][] = [
  [1950, "Walter Ormond", "Marden-Ford"], [1951, "Raoul Dufresne", "Brightwater"], [1952, "Pedro Mercer", "Orrin"],
  [1953, "Tomas Brandt", "Vanwall Works"], [1954, "Anton Kellner", "Ostrava Cars"], [1955, "Anton Dufresne", "Orrin"],
  [1956, "Bertil Lorentz", "Tamsin Cars"], [1957, "Jules Hargreaves", "Orrin"], [1958, "Bertil Dufresne", "Silvano"],
  [1959, "Mikko Delmar", "Kesselring"], [1960, "Cesare Kovacs", "Silvano"], [1961, "Nigel Vasquez", "Cardinal Corse"],
  [1962, "Raoul Brandt", "Hallam Motors"], [1963, "Graham Kellner", "Orrin"], [1964, "Rolf Aalto", "Cardinal Corse"],
  [1965, "Anton Faulkner", "Crestline"], [1966, "Rex Mercer", "Pennant"], [1967, "Nigel Meyer", "Ostrava Cars"],
  [1968, "Mikko Santoro", "Crestline"], [1969, "Stuart Whitcombe", "Pennant"], [1970, "Hans Vasquez", "Silvano"],
  [1971, "Walter Ormond", "Crestline"], [1972, "Bruno Kellner", "Silvano"], [1973, "Walter Faulkner", "Redfern"],
  [1974, "Niels Hargreaves", "Amberline Racing"], [1975, "Hans Kellner", "Cardinal Corse"], [1976, "Niels Meyer", "Cardinal Corse"],
  [1977, "Jules Fontaine", "Cardinal Corse"], [1978, "Raoul Hargreaves", "Tamsin Cars"], [1979, "Mikko Meyer", "Cardinal Corse"],
  [1980, "Bruno Mercer", "Cerulean Racing"], [1981, "Rex Mercer", "Cerulean Racing"], [1982, "Pedro Aalto", "Cardinal Corse"],
  [1983, "Mikko Ormond", "Cardinal Corse"], [1984, "Emil Ostrow", "Amberline Racing"], [1985, "Niels Kellner", "Amberline Racing"],
  [1986, "Emil Beaumont", "Cerulean Racing"], [1987, "Keith Delmar", "Cerulean Racing"], [1988, "Sandro Meyer", "Amberline Racing"],
  [1989, "Dario Callahan", "Amberline Racing"], [1990, "Bertil Ormond", "Amberline Racing"], [1991, "Keith Lindgren", "Amberline Racing"],
  [1992, "Arturo Aalto", "Cerulean Racing"], [1993, "Nigel Rossi", "Cerulean Racing"], [1994, "Keith Delmar", "Cerulean Racing"],
  [1995, "Lucien Hargreaves", "Hallam Motors"], [1996, "Graham Santoro", "Cerulean Racing"], [1997, "Raoul Callahan", "Cerulean Racing"],
  [1998, "Rex Callahan", "Amberline Racing"], [1999, "Emil Ostrow", "Cardinal Corse"], [2000, "Pedro Aalto", "Cardinal Corse"],
  [2001, "Jules Brandt", "Cardinal Corse"], [2002, "Rolf Whitcombe", "Cardinal Corse"], [2003, "Walter Vidal", "Cardinal Corse"],
  [2004, "Arturo Hargreaves", "Cardinal Corse"], [2005, "Ignacio Garrido", "Fuchsia Racing"], [2006, "Ignacio Garrido", "Fuchsia Racing"],
  [2007, "Pedro Mercer", "Cardinal Corse"], [2008, "Lionel Hargrave", "Amberline Racing"], [2009, "Hans Brandt", "Orrin"],
  [2010, "Raoul Rossi", "Cobalt Rush Racing"], [2011, "Lucien Mercer", "Cobalt Rush Racing"], [2012, "Pedro Aalto", "Cobalt Rush Racing"],
  [2013, "Rex Aalto", "Cobalt Rush Racing"], [2014, "Lionel Hargrave", "Lagoon Dynamics"], [2015, "Lionel Hargrave", "Lagoon Dynamics"],
  [2016, "Hans Ormond", "Lagoon Dynamics"], [2017, "Lionel Hargrave", "Lagoon Dynamics"], [2018, "Lionel Hargrave", "Lagoon Dynamics"],
  [2019, "Lionel Hargrave", "Lagoon Dynamics"], [2020, "Lionel Hargrave", "Lagoon Dynamics"], [2021, "Daan Brouwer", "Cobalt Rush Racing"],
  [2022, "Daan Brouwer", "Cobalt Rush Racing"], [2023, "Daan Brouwer", "Cobalt Rush Racing"], [2024, "Daan Brouwer", "Cobalt Rush Racing"],
  [2025, "Toby Carrow", "Amberline Racing"],
];

export const REAL_WCC_LIST: [number, string][] = [
  [1958, "Silvano"], [1959, "Kesselring"], [1960, "Silvano"], [1961, "Cardinal Corse"],
  [1962, "Hallam Motors"], [1963, "Orrin"], [1964, "Cardinal Corse"], [1965, "Crestline"],
  [1966, "Pennant"], [1967, "Ostrava Cars"], [1968, "Crestline"], [1969, "Pennant"],
  [1970, "Silvano"], [1971, "Crestline"], [1972, "Silvano"], [1973, "Redfern"],
  [1974, "Amberline Racing"], [1975, "Cardinal Corse"], [1976, "Cardinal Corse"], [1977, "Cardinal Corse"],
  [1978, "Tamsin Cars"], [1979, "Cardinal Corse"], [1980, "Cerulean Racing"], [1981, "Cerulean Racing"],
  [1982, "Cardinal Corse"], [1983, "Cardinal Corse"], [1984, "Amberline Racing"], [1985, "Amberline Racing"],
  [1986, "Cerulean Racing"], [1987, "Cerulean Racing"], [1988, "Amberline Racing"], [1989, "Amberline Racing"],
  [1990, "Amberline Racing"], [1991, "Amberline Racing"], [1992, "Cerulean Racing"], [1993, "Cerulean Racing"],
  [1994, "Cerulean Racing"], [1995, "Hallam Motors"], [1996, "Cerulean Racing"], [1997, "Cerulean Racing"],
  [1998, "Amberline Racing"], [1999, "Cardinal Corse"], [2000, "Cardinal Corse"], [2001, "Cardinal Corse"],
  [2002, "Cardinal Corse"], [2003, "Cardinal Corse"], [2004, "Cardinal Corse"], [2005, "Fuchsia Racing"],
  [2006, "Fuchsia Racing"], [2007, "Cardinal Corse"], [2008, "Cardinal Corse"], [2009, "Orrin"],
  [2010, "Cobalt Rush Racing"], [2011, "Cobalt Rush Racing"], [2012, "Cobalt Rush Racing"], [2013, "Cobalt Rush Racing"],
  [2014, "Lagoon Dynamics"], [2015, "Lagoon Dynamics"], [2016, "Lagoon Dynamics"], [2017, "Lagoon Dynamics"],
  [2018, "Lagoon Dynamics"], [2019, "Lagoon Dynamics"], [2020, "Lagoon Dynamics"], [2021, "Lagoon Dynamics"],
  [2022, "Cobalt Rush Racing"], [2023, "Cobalt Rush Racing"], [2024, "Amberline Racing"], [2025, "Amberline Racing"],
];

/** Titles per driver, counted from the list above. */
export function realTitleCount(name: string): number {
  return REAL_WDC.filter((x) => x[1] === name).length;
}
