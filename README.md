# BHSawesome

BHSawesome is a revision of CSAwesome2, the Runestone book CSAwesome, a
curriculum for the 2025 revision of the College Board AP Computer Science A
Course and Exam Description.

# Formatting `.ptx` files

The `.ptx` files are kept in a canonical layout produced by `xml-format`, the
config-driven XML formatter from
[xml-tools](https://github.com/gigamonkey/xml-tools). Install it (and
`xml-identify`) onto your `PATH` with [uv](https://docs.astral.sh/uv/):

    uv tool install git+https://github.com/gigamonkey/xml-tools

All the PreTeXt-specific formatting behavior — which tags are inline, verbatim
handling of `<program>` and `datafile` `<pre>` bodies, CDATA for code
containing `& < >`, compact elements, the google-java-format hook — is
configured in the checked-in `.xml-formats/ptx.json`. `xml-format` discovers
that config automatically for any `.ptx` file when run from inside the repo,
so no flags are needed:

    xml-format -i pretext/loops/for-loops.ptx  # reformat one file in place
    ./reformat-all.sh                          # reformat every book file
    ./test-all.sh                              # verify formatting is idempotent

Run any hand-edited `.ptx` file through `xml-format -i` before committing so
diffs stay canonical. With `-f`/`--format-code`, Java code inside `<program>`
elements is additionally piped through google-java-format; that requires
`google-java-format-1.25.2-all-deps.jar` (not checked in) in the current
directory.

# Authors

CSAwesome was based on the Java Review ebook written by Barbara Ericson of
University of Michigan @ericsonga, and revised and reorganized by Beryl Hoffman
of Elms College and the Mobile CSP project in 2019 for the 2019 AP CSA exam as
CSAwesome. Kate McDonnell from Cherry Creek Schools created a JUnit test code
suite in 2020 to provide feedback to students in every active code. Peter Seibel
from Berkeley High School joined the authors and developers in 2023. Many others
have contributed. For the most up to date listing of who has contributed to the
ebook see the Preface.

Peter Seibel then restructured the book into BHSawesome for use in his AP CSA
classes at Berkeley High School.
