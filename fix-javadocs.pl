#!/usr/bin/env perl -i

use warnings;
use strict;

my $JDK_VERSION = 26;

while (<>) {
    s{"https?://docs.oracle.com/javase/\d+/(docs/api)/(.*?)"}{"https://docs.oracle.com/en/java/javase/$JDK_VERSION/$1/java.base/$2"}g;
    s{"https://docs.oracle.com/en/java/javase/\d+/docs/api/java\.(.*?)/(.*?)"}{"https://docs.oracle.com/en/java/javase/$JDK_VERSION/docs/api/java.$1/$2"}g;
    print;
}

__END__
