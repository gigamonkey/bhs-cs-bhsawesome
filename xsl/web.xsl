<?xml version="1.0" encoding="UTF-8"?>
<!-- Custom XSL for the "web" target (self-hosted on the bhs-cs website).

     Stock PreTeXt renders a Java activecode as a static listing outside
     Runestone because Java needs a Jobe code-running server. Our site
     provides a Jobe-compatible endpoint (the bhs-cs runner, pointed at by
     the injected /js/bhsawesome.js overriding eBookConfig's jobehost /
     proxyuri_runs / proxyuri_files), so declare java "browser"-hosted here:
     the interactive activecode component - including its hidden unit-test
     suffix - is then emitted exactly as on Runestone. The only attributes
     this loses are data-compileargs/-interpreterargs/-linkargs (emitted only
     for hosting='jobeserver'), which this book never uses. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <xsl:import href="./core/pretext-html.xsl"/>

  <xsl:template match="*" mode="activecode-host">
    <xsl:variable name="language">
      <xsl:apply-templates select="." mode="active-language"/>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="$language = 'java'">
        <xsl:text>browser</xsl:text>
      </xsl:when>
      <xsl:otherwise>
        <xsl:apply-imports/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

</xsl:stylesheet>
