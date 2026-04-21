# xilo

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/Pilotariak/xilo/blob/main/LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Pilotariak/xilo/badge)](https://scorecard.dev/viewer/?uri=github.com/Pilotariak/xilo)

## Features

Xilo is a Slack bot for the [Pilotariak](https://github.com/Pilotariak) Basque pelota platform,
running on Cloudflare Workers. It lets you query competition data from the Frontis gateway
directly from Slack.

## Slash Commands

| Command                                                                        | Description                                |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| `/help`                                                                        | Show available commands                    |
| `/version`                                                                     | Show the bot version                       |
| `/ping`                                                                        | Say hello to the channel                   |
| `/categories <league>`                                                         | List player categories for a league        |
| `/specialties <league>`                                                        | List Basque pelota disciplines             |
| `/clubs <league>`                                                              | List clubs for a league                    |
| `/competitions <league>`                                                       | List competitions for a league             |
| `/results <league> [competitionId=x] [specialtyId=x] [categoryId=x] [phase=x]` | List match results                         |
| `/ask <league> <question>`                                                     | Ask a natural-language question (AI agent) |

Example:

```
/ask ccapb What are the results of "Trinquet / P.G. Pleine Masculin" in "1ère Série"?
```

## Natural Language (AI Agent)

Mention the bot or send it a direct message to ask questions in plain English or French.
Append `(DEBUG=true)` to any question to see the GraphQL queries being executed.

### Listing data

```
@Xilo what are the competitions for lcapb
@Xilo what are the categories for lcapb
@Xilo what are the specialities for lcapb
@Xilo what are the clubs for lcapb
```

### Querying results

```
@Xilo what are the results for competition "Championnat CCAPB 2025-2026"
       in speciality "Trinquet / P.G. Pleine Masculin"
       in category "1ère Série" for lcapb
```

Example responses:

> **Résultats — Trinquet / P.G. Pleine Masculin | 1ère Série | Championnat CCAPB 2025-2026**
>
> - 02/11/2025 [P 18] — BORDEAUX ETUDIANTS CLUB vs PILOTARI CLUB VILLENAVAIS 25/40
> - 05/10/2025 [P 4] — CA BEGLAIS vs CA BEGLAIS 40/13

### League detection

The bot detects the league code from your message automatically:

| Phrasing                       | League detected          |
| ------------------------------ | ------------------------ |
| `for league lcapb …`           | `lcapb`                  |
| `de lcapb …` / `pour lcapb …`  | `lcapb`                  |
| `lcapb what are the results …` | `lcapb`                  |
| _(no code)_                    | `DEFAULT_LEAGUE` env var |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
See [CONTRIBUTING](CONTRIBUTING.md)

## License

See [LICENSE](LICENSE)
