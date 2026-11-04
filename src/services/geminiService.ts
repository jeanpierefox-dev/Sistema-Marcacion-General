
import { GoogleGenAI, Type } from "@google/genai";
import { Team } from "../types";

// Safely retrieve API Key without crashing if process is not defined in browser
const getApiKey = () => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
      // @ts-ignore
      if (process.env.API_KEY) return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore error in browser environments where process is undefined
  }
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv?.VITE_GEMINI_API_KEY) return metaEnv.VITE_GEMINI_API_KEY;
    if (metaEnv?.GEMINI_API_KEY) return metaEnv.GEMINI_API_KEY;
  } catch (e) {
    // Ignore
  }
  return '';
};

const apiKey = getApiKey();

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateSmartFixture = async (
  teams: Team[],
  startDate: string,
  endDate: string,
  matchDays: string[] = [],
  config: { format: 'LEAGUE' | 'GROUPS' | 'KNOCKOUT_4', knockout: 'SEMIS' | 'FINAL' | 'NONE' } = { format: 'LEAGUE', knockout: 'SEMIS' }
): Promise<{ groups: any, fixtures: any[] }> => {
  
  try {
    // Use Mock if no API key is present
    if (!ai || !apiKey) {
      console.warn("No API Key or AI client, returning mock fixture");
      return generateBasicFixture(teams, startDate, endDate, matchDays, config);
    }

    const teamNames = teams.map(t => ({ id: t.id, name: t.name }));
    const daysString = matchDays.length > 0 ? matchDays.join(', ') : "any day";
    
    const prompt = `
      Create a volleyball tournament fixture for these teams: ${JSON.stringify(teamNames)}.
      The tournament runs from ${startDate} to ${endDate}.
      
      CONFIGURATION:
      - Format: ${config.format === 'LEAGUE' ? 'SINGLE LEAGUE (Round Robin - Everyone plays everyone)' : config.format === 'GROUPS' ? 'GROUPS (Split into balanced groups)' : 'KNOCKOUT_4 (Direct Semifinals and Final)'}.
      - Knockout Phase: ${config.knockout}.

      IMPORTANT RULES:
      1. ${config.format === 'LEAGUE' ? 'Put ALL teams in a single group called "Fase Regular".' : config.format === 'GROUPS' ? 'Divide teams into balanced groups (Group A, Group B) if more than 6 teams.' : 'No group phase. Direct knockout.'}
      2. Generate a match schedule ensuring teams play according to the format.
      3. **CRITICAL**: Matches MUST ONLY be scheduled on the following days of the week: ${daysString}.
      4. Distribute matches evenly across the available dates.

      **KNOCKOUT PHASE INSTRUCTIONS:**
      ${config.format === 'KNOCKOUT_4' ? `
      - Schedule 2 Semifinal matches FIRST.
      - Semifinal 1: Random Pair from the 4 teams.
      - Semifinal 2: Random Pair of the remaining 2 teams.
      - Final: "PLACEHOLDER_FINAL_A" vs "PLACEHOLDER_FINAL_B" (Winners of SF).
      - Set the 'group' property for Semifinals to "Semifinal" and Final to "Final".
      ` : config.knockout === 'SEMIS' ? `
      - Schedule 2 Semifinal matches AFTER the regular phase.
      - Semifinal 1: "PLACEHOLDER_SF1_A" (1st Place) vs "PLACEHOLDER_SF1_B" (4th Place/2nd Group B).
      - Semifinal 2: "PLACEHOLDER_SF2_A" (2nd Place) vs "PLACEHOLDER_SF2_B" (3rd Place/2nd Group A).
      - Final: "PLACEHOLDER_FINAL_A" vs "PLACEHOLDER_FINAL_B" (Winners of SF).
      ` : config.knockout === 'FINAL' ? `
      - Schedule 1 Final match AFTER the regular phase.
      - Final: "PLACEHOLDER_FINAL_A" (1st Place) vs "PLACEHOLDER_FINAL_B" (2nd Place).
      ` : ''}
      
      Set the 'group' property for knockout matches to "Semifinal" or "Final".
      
      5. Return JSON with 'groupsArray' (list of groups with name and teamIds) and 'fixtures'.
    `;

    // Retry logic for robust API calls
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
        try {
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    groupsArray: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          groupName: { type: Type.STRING },
                          teamIds: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                          }
                        },
                        required: ["groupName", "teamIds"]
                      }
                    },
                    fixtures: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          date: { type: Type.STRING, description: "YYYY-MM-DD format" },
                          teamAId: { type: Type.STRING },
                          teamBId: { type: Type.STRING },
                          group: { type: Type.STRING }
                        },
                        required: ["date", "teamAId", "teamBId", "group"]
                      }
                    }
                  },
                  required: ["groupsArray", "fixtures"]
                }
              }
            });

            let text = response.text;
            if (!text) throw new Error("Empty response from AI");
            
            // Clean up potential markdown formatting from AI
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const data = JSON.parse(text);
            
            // Transform groupsArray back to Map for the app: { "Group A": ["id1", "id2"] }
            const groupsMap: Record<string, string[]> = {};
            if (data.groupsArray && Array.isArray(data.groupsArray)) {
                data.groupsArray.forEach((g: any) => {
                    if (g.groupName && g.teamIds) {
                        groupsMap[g.groupName] = g.teamIds;
                    }
                });
            }

            // Safety check for fixtures
            const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];

            if (fixtures.length === 0) {
                console.warn("AI returned empty fixtures, using fallback");
                return generateBasicFixture(teams, startDate, endDate, matchDays, config);
            }

            return { groups: groupsMap, fixtures };

        } catch (err: any) {
            console.warn(`Gemini attempt failed (${retries} left):`, err.message);
            lastError = err;
            retries--;
            if (retries > 0) {
                // Exponential backoff: 1s, 2s, 4s...
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
            }
        }
    }
    
    throw lastError || new Error("All retry attempts failed");

  } catch (error) {
    console.error("Gemini Service Failed - Using Fallback Generator", error);
    // Fallback to mock generation if AI fails entirely
    return generateBasicFixture(teams, startDate, endDate, matchDays, config);
  }
};

export const analyzeMatchStats = async (matchStats: any) => {
    if (!ai || !apiKey) return "Análisis de IA no disponible (Falta API Key).";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Analyze these volleyball match statistics and provide a brief, professional commentary in Spanish highlighting the MVP and key moments: ${JSON.stringify(matchStats)}`
        });
        return response.text;
    } catch (e) {
        return "Error generando análisis.";
    }
}

// Robust Fallback Generator (Exported for App.tsx usage)
export const generateBasicFixture = (
  teams: Team[], 
  startDate: string, 
  endDate: string, 
  matchDays: string[],
  config: { format: 'LEAGUE' | 'GROUPS' | 'KNOCKOUT_4', knockout: 'SEMIS' | 'FINAL' | 'NONE' } = { format: 'LEAGUE', knockout: 'SEMIS' }
) => {
  const groups: Record<string, string[]> = {};
  const fixtures: any[] = [];
  
  // 1. Calculate available dates correctly using UTC to avoid timezone shifts
  const dates: string[] = [];
  // Ensure valid date objects
  // Parse YYYY-MM-DD strings as UTC midnight to avoid timezone shifts
  const parseDate = (d: string) => {
      if (!d) return new Date();
      const [y, m, day] = d.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, day));
  };

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  
  // Mapping Spanish days to JS getUTCDay() (0=Sunday, 1=Monday...)
  const dayMap: Record<string, number> = {
      'Domingo': 0, 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6
  };
  
  const allowedDayIndices = matchDays.length > 0 ? matchDays.map(d => dayMap[d]).filter(d => d !== undefined) : null;

  let current = new Date(start);
  let safetyCounter = 0;
  
  // Iterate dates (Safe loop limit 365 days)
  while (current <= end && safetyCounter < 365) {
      const dayIndex = current.getUTCDay();
      // If no allowed days specified, allow all. Otherwise check filter.
      if (!allowedDayIndices || allowedDayIndices.length === 0 || allowedDayIndices.includes(dayIndex)) {
          dates.push(current.toISOString().split('T')[0]);
      }
      current.setUTCDate(current.getUTCDate() + 1);
      safetyCounter++;
  }
  
  // If no matching dates found (e.g. range too short or no match), fallback to start date to ensure fixture isn't empty
  if (dates.length === 0) dates.push(startDate);

  // 2. Generate Matches
  if (config.format === 'KNOCKOUT_4' && teams.length >= 4) {
      // KNOCKOUT_4 LOGIC
      groups["Eliminatoria"] = teams.map(t => t.id);
      
      // Shuffle teams for random matchups
      const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);

      // Semifinals
      const semiDate = dates[0];
      const finalDate = dates.length > 1 ? dates[dates.length - 1] : dates[0];

      fixtures.push({
          date: semiDate,
          teamAId: shuffledTeams[0].id,
          teamBId: shuffledTeams[1].id,
          group: 'Semifinal'
      });
      fixtures.push({
          date: semiDate,
          teamAId: shuffledTeams[2].id,
          teamBId: shuffledTeams[3].id,
          group: 'Semifinal'
      });

      // Final Placeholder
      fixtures.push({
          date: finalDate,
          teamAId: 'PLACEHOLDER_FINAL_A',
          teamBId: 'PLACEHOLDER_FINAL_B',
          group: 'Final'
      });

  } else {
      // ROUND ROBIN / GROUPS LOGIC
      const generateGroupFixtures = (groupTeams: Team[], groupName: string) => {
          let dateIndex = 0;
          for (let i = 0; i < groupTeams.length; i++) {
            for (let j = i + 1; j < groupTeams.length; j++) {
              fixtures.push({
                date: dates[dateIndex % dates.length],
                teamAId: groupTeams[i].id,
                teamBId: groupTeams[j].id,
                group: groupName
              });
              dateIndex++;
            }
          }
      };

      // Logic: Split into groups if too many teams for a single round robin AND format is GROUPS
      if (config.format === 'GROUPS' && teams.length > 8) {
          const half = Math.ceil(teams.length / 2);
          const groupA = teams.slice(0, half);
          const groupB = teams.slice(half);
          
          groups["Grupo A"] = groupA.map(t => t.id);
          groups["Grupo B"] = groupB.map(t => t.id);
          
          generateGroupFixtures(groupA, "Grupo A");
          generateGroupFixtures(groupB, "Grupo B");
      } else {
          groups["Fase Regular"] = teams.map(t => t.id);
          generateGroupFixtures(teams, "Fase Regular");
      }

      // 3. Add Knockout Phase Placeholders (Only for League/Groups)
      const lastDate = dates[dates.length - 1] || endDate;
      
      if (config.knockout === 'SEMIS' && teams.length >= 4) {
          fixtures.push({
              date: lastDate,
              teamAId: 'PLACEHOLDER_SF1_A',
              teamBId: 'PLACEHOLDER_SF1_B',
              group: 'Semifinal'
          });
          fixtures.push({
              date: lastDate,
              teamAId: 'PLACEHOLDER_SF2_A',
              teamBId: 'PLACEHOLDER_SF2_B',
              group: 'Semifinal'
          });
          fixtures.push({
              date: lastDate,
              teamAId: 'PLACEHOLDER_FINAL_A',
              teamBId: 'PLACEHOLDER_FINAL_B',
              group: 'Final'
          });
      } else if (config.knockout === 'FINAL' && teams.length >= 2) {
          fixtures.push({
              date: lastDate,
              teamAId: 'PLACEHOLDER_FINAL_A',
              teamBId: 'PLACEHOLDER_FINAL_B',
              group: 'Final'
          });
      }
  }

  return { groups, fixtures };
};
