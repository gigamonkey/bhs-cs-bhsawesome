#!/usr/bin/env perl
#
# Flag titles with nonstandard capitalization (anything capitalized after
# the first word, once the usual acronyms are discounted). Feed it titles,
# one per line, e.g.
#
#     xsltproc --xinclude scripts/titles.xsl <book>/source/main.ptx | scripts/bad-titles.pl

use warnings;
use strict;


while (<>) {
    my $title = $_;
    $title =~ s/Java/java/g;
    $title =~ s/AP/ap/g;
    $title =~ s/CSA/csa/g;
    $title =~ s/CSP/csp/g;
    if ($title =~ /^[A-Z]*[^A-Z]+[A-Z].*$/) {
        print;
    }
}

__END__
