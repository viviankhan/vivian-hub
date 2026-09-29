"""Say scientific notation the way a person would explain it out loud.

Used by voice.py's speakable(), which rewrites only what is SPOKEN; the text on
screen is never changed. src/lib/paperText.js carries a JavaScript twin for the
phone's quick voice, and tests/speakable_cases.json holds the cases both must
agree on.

    CO2          -> carbon bonded to two oxygen atoms
    Ca2+ / Ca²⁺  -> calcium ion, with a positive charge of 2
    C=O          -> carbon double-bonded to oxygen
    x² / x^2     -> x squared
    3 × 10^-5    -> 3 times ten to the power of minus 5
    5 µM         -> 5 micromolar
    2-chloropropan-1-ol -> 2 chloro propan 1 ol

Biology names that happen to look like formulas (SOCS3, PI3K, H3K27, HeLa, Th17,
C3, B12) are left alone: see looks_like_formula().
"""
import re

ELEMENTS = {
    "H": "hydrogen", "He": "helium", "Li": "lithium", "Be": "beryllium", "B": "boron",
    "C": "carbon", "N": "nitrogen", "O": "oxygen", "F": "fluorine", "Ne": "neon",
    "Na": "sodium", "Mg": "magnesium", "Al": "aluminium", "Si": "silicon", "P": "phosphorus",
    "S": "sulfur", "Cl": "chlorine", "Ar": "argon", "K": "potassium", "Ca": "calcium",
    "Sc": "scandium", "Ti": "titanium", "V": "vanadium", "Cr": "chromium", "Mn": "manganese",
    "Fe": "iron", "Co": "cobalt", "Ni": "nickel", "Cu": "copper", "Zn": "zinc",
    "Ga": "gallium", "Ge": "germanium", "As": "arsenic", "Se": "selenium", "Br": "bromine",
    "Kr": "krypton", "Rb": "rubidium", "Sr": "strontium", "Y": "yttrium", "Zr": "zirconium",
    "Mo": "molybdenum", "Ag": "silver", "Cd": "cadmium", "Sn": "tin", "Sb": "antimony",
    "I": "iodine", "Xe": "xenon", "Cs": "caesium", "Ba": "barium", "La": "lanthanum",
    "Gd": "gadolinium", "W": "tungsten", "Pt": "platinum", "Au": "gold", "Hg": "mercury",
    "Pb": "lead", "Bi": "bismuth", "Rn": "radon", "U": "uranium", "Li": "lithium",
}
ANION = {"Cl": "chloride", "F": "fluoride", "Br": "bromide", "I": "iodide",
         "O": "oxide", "S": "sulfide", "N": "nitride", "H": "hydride"}
# Common polyatomic ions, by formula without the charge.
POLYATOMIC = {
    "NH4": "ammonium", "H3O": "hydronium", "OH": "hydroxide", "NO3": "nitrate",
    "NO2": "nitrite", "SO4": "sulfate", "SO3": "sulfite", "PO4": "phosphate",
    "HPO4": "hydrogen phosphate", "H2PO4": "dihydrogen phosphate", "CO3": "carbonate",
    "HCO3": "bicarbonate", "CN": "cyanide", "MnO4": "permanganate", "ClO": "hypochlorite",
    "CH3COO": "acetate",
}
DIATOMIC = {"H2", "N2", "O2", "O3", "F2", "Cl2", "Br2", "I2", "P4", "S8"}
# Look like formulas, aren't: cell lines, proteins, T-helper subsets, flu strains.
NOT_FORMULAS = {"HeLa", "BiP", "NaV", "CaV", "InS"}
NOT_FORMULA_RE = re.compile(r"^(Th\d+|H\d+N\d+|B\d+|C\d+[a-z]?)$")
# Upper-case-only formulas are only believed with these elements (genes like
# SOCS3, PI3K, H3K27 use others or lack hydrogen).
UPPER_OK = set("CHONSPFI")
UPPER_COMMON = {"CO", "CO2", "SO2", "SO3", "NO2", "N2O", "O2", "O3", "N2", "H2", "F2", "I2", "P4", "S8"}

SYM = "(?:" + "|".join(sorted(ELEMENTS, key=len, reverse=True)) + ")"
TOKEN_RE = re.compile("(" + SYM + r")(\d*)")
WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
         "nine", "ten", "eleven", "twelve"]


def num(n):
    return WORDS[n] if n < len(WORDS) else str(n)


def parse(tok):
    """'CH3CH2OH' -> [('C',1),('H',3),('C',1),('H',2),('O',1),('H',1)], or None."""
    out, pos = [], 0
    while pos < len(tok):
        m = TOKEN_RE.match(tok, pos)
        if not m:
            return None
        out.append((m.group(1), int(m.group(2) or 1)))
        pos = m.end()
    return out


def looks_like_formula(tok):
    if tok in NOT_FORMULAS or NOT_FORMULA_RE.match(tok):
        return False
    parts = parse(tok)
    if not parts:
        return False
    if len(parts) == 1:
        return tok in DIATOMIC
    if any(c.islower() for c in tok):          # CamelCase symbols: NaCl, CaCO3, HCl
        return True
    if tok in UPPER_COMMON:
        return True
    elems = {e for e, _ in parts}
    return any(ch.isdigit() for ch in tok) and elems <= UPPER_OK and "H" in elems


def atoms(n, el):
    return "%s %s atom%s" % (num(n), ELEMENTS[el], "" if n == 1 else "s")


def describe(tok):
    parts = parse(tok)
    if len(parts) == 1:
        el, n = parts[0]
        return "%s %s atoms bonded together" % (num(n), ELEMENTS[el])
    total = {}
    for el, n in parts:
        total[el] = total.get(el, 0) + n
    repeated = len(total) < len(parts)
    if len(total) == 2 and not repeated:
        (a, na), (b, nb) = parts
        # The atom there's one of is the one the others bond to; prefer a
        # non-hydrogen centre (H2O is oxygen bonded to two hydrogens).
        if nb == 1 and na != 1 and b != "H":
            a, na, b, nb = b, nb, a, na
        if na == 1:
            return "%s bonded to %s" % (ELEMENTS[a], atoms(nb, b) if nb > 1 else ELEMENTS[b])
    items = [atoms(n, el) for el, n in total.items()]
    return "a molecule of " + (", ".join(items[:-1]) + " and " + items[-1])


def ion(tok, charge, sign):
    n = int(charge or 1)
    kind = "positive" if sign == "+" else "negative"
    if tok in POLYATOMIC:
        name = POLYATOMIC[tok]
    elif tok in ELEMENTS:
        name = ANION.get(tok, ELEMENTS[tok]) if sign == "-" else ELEMENTS[tok]
    else:
        return None
    return " %s ion, with a %s charge of %d, " % (name, kind, n)


SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻", "0123456789+-")
SUB = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")


def normalize(s):
    s = s.translate(SUB).replace("−", "-")
    return re.sub(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+", lambda m: "^" + m.group(0).translate(SUP), s)


UNITS = {"M": "molar", "mM": "millimolar", "µM": "micromolar", "μM": "micromolar", "uM": "micromolar",
         "nM": "nanomolar", "pM": "picomolar", "mg": "milligrams", "µg": "micrograms",
         "μg": "micrograms", "ng": "nanograms", "kg": "kilograms", "g": "grams",
         "mL": "millilitres", "ml": "millilitres", "µL": "microlitres", "μL": "microlitres",
         "uL": "microlitres", "L": "litres", "kDa": "kilodaltons", "Da": "daltons",
         "bp": "base pairs", "kb": "kilobases", "nm": "nanometres", "µm": "micrometres",
         "μm": "micrometres", "mm": "millimetres", "cm": "centimetres", "min": "minutes"}
UNIT = "(?:" + "|".join(sorted(map(re.escape, UNITS), key=len, reverse=True)) + ")"


def units(s):
    def rep(m):
        out = " " + UNITS[m.group(2)]
        if m.group(3):
            out += " per " + UNITS[m.group(3)].rstrip("s")
        return m.group(1) + out + " "
    return re.sub(r"(\d)\s{0,2}(" + UNIT + r")(?:/(" + UNIT + r"))?(?![\w/])", rep, s)


def power(exp):
    exp = exp.strip("{}()")
    if exp == "2":
        return " squared "
    if exp == "3":
        return " cubed "
    return " to the power of " + ("minus " + exp[1:] if exp.startswith("-") else exp) + " "


def bonds(s):
    bond = {"-": "single-bonded to", "–": "single-bonded to", "—": "single-bonded to",
            "=": "double-bonded to", "≡": "triple-bonded to"}

    def rep(m):
        chain = re.split(r"([-–—=≡])", m.group(0))
        atoms_ = chain[0::2]
        # Plain hyphens between letters are usually just hyphens (K-S test):
        # only read them as bonds in organic-looking chains.
        if not set(atoms_) & {"C", "H", "O", "N"}:
            return m.group(0)
        words = [ELEMENTS[atoms_[0]]]
        for i, b in enumerate(chain[1::2]):
            words.append(("" if i == 0 else ", ") + bond[b] + " " + ELEMENTS[atoms_[i + 1]])
        return " " + " ".join(words).replace(" , ", ", ") + " "
    return re.sub(r"(?<![\w-])" + SYM + r"(?:[-–—=≡]" + SYM + r")+(?![\w=≡–—-])", rep, s)


def chemistry(s):
    s = normalize(s)
    # 3.2 × 10^-5, 3.2 x 10-5 is too ambiguous to guess at; 1e-5 too.
    s = re.sub(r"(\d)\s*[×x·]\s*10\s*\^\s*\(?(-?\d+)\)?",
               lambda m: m.group(1) + " times ten" + power(m.group(2)), s)
    s = re.sub(r"\b(\d+(?:\.\d+)?)[eE](-?\d+)\b",
               lambda m: m.group(1) + " times ten" + power(m.group(2)), s)
    # Ions: Ca2+, Ca^2+, Fe3+, Na+, Cl-, SO4^2-, NH4+, HCO3-.

    def ion_rep(m):
        tok, charge, sign = m.group(1), m.group(2), m.group(3)
        if not m.group(4):                      # "Ca2+": for one atom the digit is the charge
            parts = parse(tok) or []
            if len(parts) == 1 and parts[0][1] > 1 and tok not in POLYATOMIC:
                tok, charge = parts[0][0], str(parts[0][1])
        if tok in ("O", "B", "A", "AB") and not charge:   # blood types
            return None
        return ion(tok, charge, sign)
    s = re.sub(r"(?<![\w^])((?:" + SYM + r"\d*)+?)(?:\^(\d*)|\s?(\d)?)([+-])(?=[\s.,;:)\]/-]|$)",
               lambda m: ion_rep(_Ion(m)) or m.group(0), s)
    s = bonds(s)
    s = re.sub(r"(?<![\w-])([A-Z][A-Za-z0-9]*)(?![\w-])",
               lambda m: " " + describe(m.group(1)) + " " if looks_like_formula(m.group(1)) else m.group(0), s)
    s = units(s)
    s = re.sub(r"\^\s*(\{[^}]*\}|\([^)]*\)|-?[\w.]+)", lambda m: power(m.group(1)), s)
    return s


class _Ion:
    """Adapts the ion regex's two charge spellings (^2+ and 2+) to one shape."""
    def __init__(self, m):
        self.m = m

    def group(self, i):
        m = self.m
        if i == 1:
            return m.group(1)
        if i == 2:
            return m.group(2) if m.group(2) is not None else m.group(3)
        if i == 3:
            return m.group(4)
        if i == 4:
            return m.group(2) is not None     # explicit ^: the digit is the charge
        return m.group(i)


PREFIX = r"(?:chloro|bromo|fluoro|iodo|nitro|amino|hydroxy|methoxy|ethoxy|oxo|cyano|methyl|ethyl|propyl|butyl|phenyl)"
PARENT = r"(?:meth|eth|prop|but|pent|hex|hept|oct|non|dec|benz|phen|cyclo)"


def iupac(s):
    """2-chloropropan-1-ol -> 2 chloro propan 1 ol; 1,2-dichloroethane -> 1 2 di chloro ethane."""
    s = re.sub(r"\(([RSEZ])\)-", r" \1 ", s)
    s = re.sub(r"(?<=[a-z])-(\d+(?:,\d+)*)-(?=[a-z])", lambda m: " " + m.group(1).replace(",", " ") + " ", s)
    s = re.sub(r"\b(\d+(?:,\d+)*)-(?=[a-z])", lambda m: m.group(1).replace(",", " ") + " ", s)
    s = re.sub(r"\b([A-Z](?:,[A-Z])+)-(?=[a-z])", lambda m: m.group(1).replace(",", " ") + " ", s)
    s = re.sub(r"\b(di|tri|tetra)?(" + PREFIX + r")(?=" + PARENT + ")",
               lambda m: ((m.group(1) + " ") if m.group(1) else "") + m.group(2) + " ", s)
    return s


MATH = [("√", " square root of "), ("∑", " the sum of "), ("∝", " proportional to "),
        ("≠", " not equal to "), ("∞", " infinity "), ("⇌", " in equilibrium with "),
        ("⟶", " leading to "), ("½", " one half "), ("¼", " one quarter "), ("¾", " three quarters ")]


def math_symbols(s):
    for k, v in MATH:
        s = s.replace(k, v)
    return s
