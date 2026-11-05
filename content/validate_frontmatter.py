"""Validate authoring frontmatter only; never imports, approves or publishes."""
import argparse
import re
from pathlib import Path
import yaml

class UniqueKeysLoader(yaml.SafeLoader):
    pass

def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str):
            raise ValueError("metadata keys must be strings")
        if key in result:
            raise ValueError("duplicate metadata key: " + key)
        result[key] = loader.construct_object(value_node, deep=deep)
    return result

UniqueKeysLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)

REQUIRED = {"title", "slug", "language", "document_type", "summary", "primary_domain"}
OPTIONAL = {"aliases", "secondary_domains", "seo", "social"}

def text(value, label):
    if not isinstance(value, str) or not value.strip() or any(c in value for c in "\r\n\x00"):
        raise ValueError(label + " must be nonempty single-line text")

def validate(markdown):
    match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)", markdown, re.S)
    if not match:
        raise ValueError("missing frontmatter")
    data = yaml.load(match.group(1), Loader=UniqueKeysLoader)
    if not isinstance(data, dict):
        raise ValueError("frontmatter must be a mapping")
    missing = REQUIRED - data.keys()
    unknown = data.keys() - REQUIRED - OPTIONAL
    if missing or unknown:
        raise ValueError("missing=" + str(sorted(missing)) + "; forbidden/unknown=" + str(sorted(unknown)))
    for key in REQUIRED:
        text(data[key], key)
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", data["slug"]):
        raise ValueError("invalid slug")
    if data["language"] != "en":
        raise ValueError("current pilot accepts English renditions only")
    for key in ["aliases", "secondary_domains"]:
        if key in data:
            if not isinstance(data[key], list):
                raise ValueError(key + " must be a list")
            for item in data[key]:
                text(item, key)
            if len(data[key]) != len(set(data[key])):
                raise ValueError("duplicate values in " + key)
    for group, allowed in [("seo", {"title", "description"}), ("social", {"title", "description", "image_ref"})]:
        if group in data:
            values = data[group]
            if not isinstance(values, dict) or values.keys() - allowed:
                raise ValueError("invalid " + group + " fields")
            for key, value in values.items():
                text(value, group + "." + key)
    if not re.search(r"(?m)^# " + re.escape(data["title"]) + r"\s*$", markdown[match.end():]):
        raise ValueError("document H1 must match its title")
    return data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()
    for path in args.files:
        validate(path.read_text(encoding="utf-8"))
        print(str(path) + ": authoring metadata valid (not approved or published)")
