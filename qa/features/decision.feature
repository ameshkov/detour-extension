Feature: The guard decides whether a page may load
  The guard runs in every top-level document before the page paints. It asks the
  service worker one question, and only a listed page with a wall that the reader
  chose is stopped. Every other answer, including a failure and a timeout, lets
  the page load.

  Background:
    Given Detour is enabled
    And the stored list names cnet.com with an ad-blocker wall that stops a page
    And the reader holds no allowance for the site

  @e2e
  Scenario: A listed page whose wall the reader chose is stopped
    When the reader opens a cnet.com article
    Then the document is hidden before the worker answers
    And the tab moves to the block page for that article
    And the block page names CNET and counts one wall

  @e2e
  Scenario: A listed page whose walls are all switched off loads
    Given the reader has switched every ad-blocker wall off in the settings
    When the reader opens the cnet.com article
    Then the article loads
    And no block page appears

  @e2e
  Scenario: A page the list does not carry loads
    When the reader opens an example.com page
    Then the page loads
    And no block page appears

  @e2e
  Scenario: A path outside the entry's globs loads
    Given the list names hbr.org only for the stories under its article paths
    When the reader opens the hbr.org home page
    Then the page loads
    And the popup names it as a site that is not on the list

  @unit
  Scenario: A list that the backend disabled stops nothing
    Given the served list carries disabled true
    When the reader opens the cnet.com article
    Then the page loads

  @unit
  Scenario: A reader who switched Detour off stops nothing
    Given the switch in the popup is off
    When the reader opens the cnet.com article
    Then the page loads

  @unit
  Scenario: A permanent allowance opens the site
    Given the reader chose "This site always" on a block page for cnet.com
    When the reader opens another cnet.com article
    Then the article loads
    And the allowance is listed on the options page

  @e2e @unit
  Scenario: A tab allowance opens the site in that tab only
    Given the reader pressed "Open CNET anyway" on the block page
    Then the article loads in that tab
    And the allowance is stored for that tab
    But another tab on the same article is stopped again

  @e2e
  Scenario: A one-time pass opens one navigation and writes no allowance
    Given the reader pressed "Open CNET anyway" and chose "Just once"
    Then the article loads
    And the options page lists no allowance
    And the next visit to the article is stopped again

  @unit
  Scenario: A guard that cannot reach the worker lets the page load
    Given the worker does not answer the question
    When the guard asks
    Then the document is shown again

  @unit
  Scenario: A guard that times out lets the page load
    Given the worker answers after the guard gave up
    Then the document is shown again
    And the late answer changes nothing

  @unit
  Scenario: A failed navigation leaves the reader a way to the block page
    Given the worker says the page stops but cannot move the tab
    Then the document is shown again
    And one link to the block page appears

  @unit
  Scenario: A document inside a frame is not decided
    Given a page frames the cnet.com article
    Then the guard draws nothing
    And the guard asks the worker nothing

  @unit
  Scenario: One document is decided once
    When the guard runs a second time on the same document
    Then it asks the worker nothing
    And it marks nothing on the page that a publisher script could read
