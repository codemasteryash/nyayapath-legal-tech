"""
Insert a `ratio` field into every judgment record in data/knowledge/judgments.json.

A ratio is the legal principle a decision stands for - the part a court or an
opposing party treats as binding on the question, as opposed to the longer
plain-language holding. Each one below is a distillation of the `holding` text
already present in the same record. Nothing here introduces a holding that is not
already in the file.

The script edits the file line by line rather than round-tripping it through
json.dump, so the existing formatting and key order are preserved exactly.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "data" / "knowledge" / "judgments.json"

# Matches the value of an "id" key on a line of its own.
ID_RE = re.compile(r'"id"\s*:\s*("(?:[^"\\]|\\.)*")')
VERIFICATION_RE = re.compile(r'"verification"\s*:')

RATIOS = {
    "vishaka-1997": (
        "An employer is under a duty to provide a mechanism to redress sexual harassment at the "
        "workplace, and until an enactment supplies one the Court's Vishaka guidelines govern: a "
        "written complaint to an Internal Complaints Committee, dealt with by a time-bound procedure."
    ),
    "bhanwari-devi-1997": (
        "A practice cannot be defended merely because it is custom. Where custom offends public "
        "morality and the Constitution it is void, and offences arising from it must be tried under "
        "the criminal law rather than by caste or community sanctions."
    ),
    "dalia-v-state-of-up-2020": (
        "An advocate appearing before a court is not to be arrested. If one is arrested, the court "
        "before which the advocate is produced must record the reasons for the arrest, and those "
        "reasons must be examined in camera."
    ),
    "rajnesh-v-state-of-mp-2020": (
        "A complaint of circulating or morphing intimate images must be attended to without delay, and "
        "a pre-arrest application disposed of within twenty-four hours by a designated Mahila Bench. "
        "The police must trace the origin of the content and may not delay investigation on the ground "
        "that the accused is unidentified."
    ),
    "aureliano-fernandes-2022": (
        "An intermediary that hosts pornographic content, or where such content is dominant, loses "
        "the safe harbour available to a mere intermediary and must provide grievance redressal "
        "within the period prescribed by law."
    ),
    "shreya-singhal-2015": (
        "An order restricting online material on the ground of offensiveness must be made by a "
        "competent authority after an adjudicatory process, does not apply to literary, artistic, "
        "religious or public-interest material, and may be made only to protect women and children. "
        "Blocking orders are not to be used."
    ),
    "honeysingh-2016": (
        "Whether a work is obscene falls to be judged from the words as actually used and in the "
        "context in which they are used. Words that are not lascivious and do not arouse lascivious "
        "thoughts in the mind of an ordinary person are not obscene."
    ),
    "dk-basu-1997": (
        "On every arrest the memo must bear the time, date and place of arrest, be attested by a "
        "witness and countersigned by the arresting officer; the arrest must be intimated to a friend "
        "or relative; and the Magistrate's diary must record the proceedings."
    ),
    "hussainara-khatton-1980": (
        "Pre-trial detention that has become disproportionate to the offence violates Article 21. "
        "Where a person is not produced before a Magistrate within the prescribed period after "
        "arrest, the presumption is that he has been killed or concealed and the State must rebut it."
    ),
    "laxmikant-pandey-1984": (
        "Relatives of the husband may be treated as cognizant of the offence of abetment of dowry "
        "death, and detailed guidelines govern the constitution and working of the authorities "
        "entitled to redress dowry harassment complaints."
    ),
    "sr-batra-2007": (
        "A 'shared household' is one where the parties have lived together in a domestic relationship. "
        "A wife may claim residence in a shared household even without title to the property, and "
        "living separately or not being in actual possession does not by itself defeat the claim."
    ),
    "jit-ram-shiv-kumar-2022": (
        "In loan-secured recovery the terms of the security document, and who signed it, determine "
        "the rights and liabilities of the guarantor. The framework governing enforcement of such "
        "security is settled by the Court, not by the lending institution alone."
    ),
    "rama-2010": (
        "Where a complaint concerns a defect or deficiency in goods or services, the consumer "
        "legislation governs the forum and the remedy, and a civil suit is not maintainable to the "
        "extent that the consumer statute confers jurisdiction on the consumer forums."
    ),
    "online-gaming-2022": (
        "Regulation of online gaming intermediaries, and amendments to intermediary guidelines, must "
        "fall within the scope of the parent Act as framed. An ultra vires exercise of power is set "
        "aside, and the legislature may regulate the sector in an appropriate manner."
    ),
}


def main() -> int:
    lines = TARGET.read_text(encoding="utf-8").splitlines(keepends=True)

    ids = []
    for line in lines:
        m = ID_RE.search(line)
        if m:
            ids.append(json.loads(m.group(1)))

    missing = [i for i in ids if i not in RATIOS]
    if missing:
        print("no ratio written for:", missing, file=sys.stderr)
        return 1

    out: list[str] = []
    current = None
    inserted = set()

    for line in lines:
        m = ID_RE.search(line)
        if m:
            current = json.loads(m.group(1))
        # Insert the ratio immediately before the closing metadata of the record.
        if VERIFICATION_RE.search(line) and current and current not in inserted:
            indent = line[: len(line) - len(line.lstrip())]
            out.append(f'{indent}"ratio": {json.dumps(RATIOS[current], ensure_ascii=False)},\n')
            inserted.add(current)
        out.append(line)

    if inserted != set(RATIOS):
        print("did not insert for:", set(RATIOS) - inserted, file=sys.stderr)
        return 1

    text = "".join(out)

    old_policy = "`holding` is a plain-language paraphrase written for a lay reader"
    new_policy = (
        "`ratio` is the legal principle the decision stands for, distilled from `holding`; "
        "`holding` is a plain-language paraphrase written for a lay reader"
    )
    if old_policy not in text:
        print("verificationPolicy sentence not found", file=sys.stderr)
        return 1
    text = text.replace(old_policy, new_policy, 1)

    TARGET.write_text(text, encoding="utf-8")

    doc = json.loads(TARGET.read_text(encoding="utf-8"))
    for rec in doc["judgments"]:
        assert rec.get("ratio"), rec["id"]
    print(f"inserted {len(inserted)} ratios; file re-parses cleanly; "
          f"{len(doc['judgments'])} judgments verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
