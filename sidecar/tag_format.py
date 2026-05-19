"""Tag string normalization.

WD Tagger émet des tags Danbooru avec des underscores (``blue_hair``).
Pour le captioning on veut des espaces naturels (``blue hair``) — sauf
pour les kaomoji dont l'underscore fait partie du token lui-même
(``^_^``, ``>_<``). La même normalisation sert à comparer les tags
détectés aux tags costume / constants saisis par l'utilisateur, pour
qu'un tag écrit ``school_uniform`` ou ``school uniform`` matche pareil.
"""

from __future__ import annotations

# Tags emoticon (kaomoji) Danbooru : l'underscore EST le tag, jamais un
# séparateur de mots. Liste canonique de la démo WD14 de SmilingWolf.
KAOMOJI = {
    "0_0", "(o)_(o)", "+_+", "+_-", "._.", "<o>_<o>", "<|>_<|>", "=_=",
    ">_<", "3_3", "6_9", ">_o", "@_@", "^_^", "o_o", "u_u", "x_x", "|_|",
    "||_||",
}


def format_tag(tag: str) -> str:
    """Tag WD -> forme caption : underscores -> espaces, kaomoji intacts."""
    if tag in KAOMOJI:
        return tag
    return tag.replace("_", " ")


def normalize_tag(tag: str) -> str:
    """Clé de comparaison : trim, lowercase, underscores -> espaces.

    Permet à un tag costume/constant saisi ``school_uniform`` ou
    ``school uniform`` de matcher la même détection WD, peu importe la
    forme. Les kaomoji gardent leurs underscores.
    """
    t = tag.strip()
    if t in KAOMOJI:
        return t.lower()
    return t.replace("_", " ").strip().lower()
