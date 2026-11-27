Feature: The extension keeps its state across restarts and caches
  The service worker stops whenever Chrome wants, so every answer is rebuilt
  from storage. The block page may ask again after a reload, and the caches age
  out on their own.

  @unit
  Scenario: The list arrives on install, on start, and every six hours
    Given the extension is installed
    Then the worker asks the backend for the list
    And it asks again when the browser starts
    And it asks again through the six-hour alarm

  @unit
  Scenario: A failed list fetch keeps the stored list
    Given the backend answers with a failure
    Then the stored list is unchanged
    And a worker with no stored list falls back to the bundled copy

  @unit
  Scenario: A list envelope of another storage version is discarded
    Given the store holds a list written by an older storage version
    Then the worker reads the bundled copy instead

  @unit
  Scenario: Closing a tab drops that tab's records
    When the reader closes a stopped tab
    Then its capability record is gone
    And its tab allowance is gone

  @unit
  Scenario: Two stopped tabs keep their own records
    Given two tabs are stopped at the same moment
    Then each tab carries the digest of its own page
    And neither record overwrites the other

  @manual
  Scenario: A reloaded block page paints the same state
    Given the block page shows the routes for the stopped article
    When the reader reloads the page
    Then the routes, the source card, and the actions are the same
    And no second backend request is needed for a cached answer

  @manual @visual
  Scenario: A block page without its tab record offers the article again
    Given the browser restarted and the session store is empty
    When the reader restores the block page tab
    Then the headline and the source card are drawn
    And the routes and the actions are absent
    And one line names the missing record and links to the article
    When the reader presses the link
    Then the article loads through the guard and stops again
    And the new block page shows its routes

  @unit
  Scenario: A cached answer and a cached page read age out
    Given a page read is older than seven days
    Then the worker reads the page again
    And an answer older than one day is not served from the cache

  @unit
  Scenario: An answer that the backend degraded is never cached
    Given the backend answered with degraded true
    Then the answer is shown once
    And it is not written to the store

  @unit
  Scenario: The list cache holds at most its cap
    Given two hundred cached answers and five hundred cached page reads
    Then the oldest entry is dropped before a newer one
    And an expired entry is dropped before the cap is counted
