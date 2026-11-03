# Genomgång 2 — 3 nov 2026 (plan att godkänna)

Granskat: alla skärmar i mobil- och datorstorlek (mörkt tema), partigenomgång från start till matt,
"Retry mistakes", dagens session, Lichess-pussel, fel utan nätverk, en länk till ett parti som inte finns.

## A. Buggar

1. **Länk till ett parti som inte finns visar "Loading…" för evigt.** Ska säga "Game not found" med en knapp till Partier.
2. **Felmeddelande utan nätverk är tekniskt:** "Couldn't reach chess.com (Failed to fetch)." → "No connection to chess.com. Check your internet and try again."
3. **En gammal backup skriver över nya standardval.** Återställer man en backup från före ändringarna kommer "nästa pussel automatiskt" och tema "Auto" tillbaka. Backupens inställningar ska inte ändra de val du gjort efter den.
4. **Färgen på skillbarerna är inkonsekvent.** Time management 30 mot typiskt 25 är blå, Defending 3.4 mot 1.1 är orange. Orange ska betyda "sämre än typiskt" — samma regel överallt, och samma ord ("worse") som pilarna.

## B. Partigenomgång

5. **Slutet av partiet:** sista draget säger "Alex_aus_Hahndorf's Rc8# is best" och Next blir grå. Istället: "Checkmate — Alex won." och Next blir **Summary** (och "Next game" om det finns fler att gå igenom idag).
6. **"Next game" på sammanfattningen**, så att man kan gå igenom flera partier i rad utan att backa till listan.
7. **Retry: tipset syns knappt** (bara en svagt ljusare ruta). Tydligare markering av pjäsen, som i pusslen.

## C. Pussel

8. **Den lilla rutan bredvid "Black to move" ser ut som en kryssruta.** Byt mot en liten kung i rätt färg.
9. **Grå tom linje** överst i dagens session (förloppsstapel på 0). Visa "0/8" i den istället, eller dölj tills första pusslet är klart.

## D. Insights

10. **Overview upprepar Home** (score, accuracy, rating) med fem stora rutor. Förslag: ta bort Overview-fliken; flytta "Your strengths" till Skills och diagrammen till Results. 4 flikar istället för 5.
11. **Mistakes: 13 rader misstagstyper.** Visa de 5 största, resten under "Show all".
12. **"Positional error" är största posten (25 %/parti) men säger inget om vad man ska göra.** Dela upp den efter fas (öppning/mittspel/slutspel) eller byt namn till "Quiet mistakes" med en länk till pussel av just dem.
13. **Mistakes-raderna går inte att trycka på.** Varje typ ska öppna pussel av den typen (finns redan i Träning, länken saknas).

## E. Settings

14. **Grön "Change"-knapp som är avstängd** ser trasig ut. Visa den bara när namnet ändrats.

## F. Idéer (frivilliga)

15. **Veckosammanfattning på Home** varje måndag: partier, accuracy jämfört med förra veckan, fokusområdets utveckling. En rad, inte ett nytt kort.
16. **Bläddra drag med vänster/höger-svep också i pussellinjer** (finns i genomgången).
17. **"Remi från +3" som egen variant av thrown games** (du valde bara förluster förra gången — bara om du vill).

## Uppskattad omfattning

A + B + C + E: små ändringar, ungefär en timme. D: medel. F: var för sig små–medel.
