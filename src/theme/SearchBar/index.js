import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { DocSearchButton, useDocSearchKeyboardEvents } from "@docsearch/react";
import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import { useHistory } from "@docusaurus/router";
import {
  isRegexpStringMatch,
  useSearchLinkCreator,
} from "@docusaurus/theme-common";
import {
  useAlgoliaContextualFacetFilters,
  useSearchResultUrlProcessor,
} from "@docusaurus/theme-search-algolia/client";
import Translate from "@docusaurus/Translate";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { createPortal } from "react-dom";
import translations from "@theme/SearchTranslations";
import { createInsightsMiddleware } from "instantsearch.js/es/middlewares";
import {
  useInstantSearch,
  InstantSearch,
  Configure,
  useHits,
} from "react-instantsearch-hooks-web";
import algoliasearch from "algoliasearch/lite";
import aa from "search-insights";

aa("init", {
  appId: "K26H89KJU5",
  apiKey: "9f76506cf0358c279d81b2fb759fca37",
  useCookie: true,
});

const searchClient = algoliasearch(
  "K26H89KJU5",
  "9f76506cf0358c279d81b2fb759fca37"
);

let DocSearchModal = null;
function Hit({ hit, children }) {
  const { sendEvent } = useHits();
  return (
    <Link
      to={hit.url}
      onClick={() => {
        try {
          sendEvent("click", hit, "Search Results Clicked");
        } catch (e) {
          console.error(e);
        }
      }}
    >
      {children}
    </Link>
  );
}
function ResultsFooter({ state, onClose }) {
  const createSearchLink = useSearchLinkCreator();
  return (
    <Link to={createSearchLink(state.query)} onClick={onClose}>
      <Translate
        id="theme.SearchBar.seeAll"
        values={{ count: state.context.nbHits }}
      >
        {"See all {count} results"}
      </Translate>
    </Link>
  );
}
function mergeFacetFilters(f1, f2) {
  const normalize = (f) => (typeof f === "string" ? [f] : f);
  return [...normalize(f1), ...normalize(f2)];
}

function InsightsMiddleware() {
  const { use } = useInstantSearch();

  useLayoutEffect(() => {
    const middleware = createInsightsMiddleware({
      insightsClient: aa,
    });

    return use(middleware);
  }, [use]);

  return null;
}

function DocSearch({ contextualSearch, externalUrlRegex, ...props }) {
  const { siteMetadata } = useDocusaurusContext();
  const processSearchResultUrl = useSearchResultUrlProcessor();
  const contextualSearchFacetFilters = useAlgoliaContextualFacetFilters();
  const configFacetFilters = props.searchParameters?.facetFilters ?? [];
  const facetFilters = contextualSearch
    ? // Merge contextual search filters with config filters
      mergeFacetFilters(contextualSearchFacetFilters, configFacetFilters)
    : // ... or use config facetFilters
      configFacetFilters;
  // We let user override default searchParameters if she wants to
  const searchParameters = {
    ...props.searchParameters,
    facetFilters,
  };
  const history = useHistory();
  const searchContainer = useRef(null);
  const searchButtonRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState(undefined);
  const importDocSearchModalIfNeeded = useCallback(() => {
    if (DocSearchModal) {
      return Promise.resolve();
    }
    return Promise.all([
      import("@docsearch/react/modal"),
      import("@docsearch/react/style"),
      import("./styles.css"),
    ]).then(([{ DocSearchModal: Modal }]) => {
      DocSearchModal = Modal;
    });
  }, []);
  const onOpen = useCallback(() => {
    importDocSearchModalIfNeeded().then(() => {
      searchContainer.current = document.createElement("div");
      document.body.insertBefore(
        searchContainer.current,
        document.body.firstChild
      );
      setIsOpen(true);
    });
  }, [importDocSearchModalIfNeeded, setIsOpen]);
  const onClose = useCallback(() => {
    setIsOpen(false);
    searchContainer.current?.remove();
  }, [setIsOpen]);
  const onInput = useCallback(
    (event) => {
      importDocSearchModalIfNeeded().then(() => {
        setIsOpen(true);
        setInitialQuery(event.key);
      });
    },
    [importDocSearchModalIfNeeded, setIsOpen, setInitialQuery]
  );
  const navigator = useRef({
    navigate({ itemUrl }) {
      // Algolia results could contain URL's from other domains which cannot
      // be served through history and should navigate with window.location
      if (isRegexpStringMatch(externalUrlRegex, itemUrl)) {
        window.location.href = itemUrl;
      } else {
        history.push(itemUrl);
      }
    },
  }).current;
  const transformItems = useRef((items) =>
    props.transformItems
      ? // Custom transformItems
        props.transformItems(items)
      : // Default transformItems
        items.map((item) => ({
          ...item,
          url: processSearchResultUrl(item.url),
        }))
  ).current;
  const resultsFooterComponent = useMemo(
    () => (footerProps) => <ResultsFooter {...footerProps} onClose={onClose} />,
    [onClose]
  );
  const transformSearchClient = useCallback(
    (searchClient) => {
      searchClient.addAlgoliaAgent(
        "docusaurus",
        siteMetadata.docusaurusVersion
      );
      return searchClient;
    },
    [siteMetadata.docusaurusVersion]
  );
  useDocSearchKeyboardEvents({
    isOpen,
    onOpen,
    onClose,
    onInput,
    searchButtonRef,
  });
  return (
    <>
      <Head>
        {/* This hints the browser that the website will load data from Algolia,
        and allows it to preconnect to the DocSearch cluster. It makes the first
        query faster, especially on mobile. */}
        <link
          rel="preconnect"
          href={`https://${props.appId}-dsn.algolia.net`}
          crossOrigin="anonymous"
        />
      </Head>
      <InstantSearch
        indexName="gold-iota"
        insights={{ useCookie: true }}
        searchClient={searchClient}
      >
        <Configure clickAnalytics />
        <InsightsMiddleware />
        <DocSearchButton
          onTouchStart={importDocSearchModalIfNeeded}
          onFocus={importDocSearchModalIfNeeded}
          onMouseOver={importDocSearchModalIfNeeded}
          onClick={onOpen}
          ref={searchButtonRef}
          translations={translations.button}
        />

        {isOpen &&
          DocSearchModal &&
          searchContainer.current &&
          createPortal(
            <DocSearchModal
              onClose={onClose}
              initialScrollY={window.scrollY}
              initialQuery={initialQuery}
              navigator={navigator}
              transformItems={transformItems}
              hitComponent={Hit}
              transformSearchClient={transformSearchClient}
              {...(props.searchPagePath && {
                resultsFooterComponent,
              })}
              {...props}
              searchParameters={searchParameters}
              placeholder={translations.placeholder}
              translations={translations.modal}
            />,
            searchContainer.current
          )}
      </InstantSearch>
    </>
  );
}
export default function SearchBar() {
  const { siteConfig } = useDocusaurusContext();
  return <DocSearch {...siteConfig.themeConfig.algolia} />;
}