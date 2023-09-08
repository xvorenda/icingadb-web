<?php

/* Icinga DB Web | (c) 2020 Icinga GmbH | GPLv2 */

namespace Icinga\Module\Icingadb\Controllers;

use GuzzleHttp\Psr7\ServerRequest;
use Icinga\Module\Icingadb\Model\Servicegroup;
use Icinga\Module\Icingadb\Model\ServicegroupSummary;
use Icinga\Module\Icingadb\Web\Control\SearchBar\ObjectSuggestions;
use Icinga\Module\Icingadb\Web\Controller;
use Icinga\Module\Icingadb\Widget\ItemTable\ServicegroupTable;
use Icinga\Module\Icingadb\Web\Control\ViewModeSwitcher;
use Icinga\Module\Icingadb\Widget\ShowMore;
use ipl\Web\Control\LimitControl;
use ipl\Web\Control\SortControl;
use ipl\Web\Url;

class ServicegroupsController extends Controller
{
    public function init()
    {
        parent::init();

        $this->assertRouteAccess();
    }

    public function indexAction()
    {
        $this->addTitleTab(t('Service Groups'));
        $compact = $this->view->compact;

        $db = $this->getDb();

        $servicegroups = ServicegroupSummary::on($db);

        $this->handleSearchRequest($servicegroups);

        $limitControl = $this->createLimitControl();
        $paginationControl = $this->createPaginationControl($servicegroups);
        $viewModeSwitcher = $this->createViewModeSwitcher($paginationControl, $limitControl);

        $defaultSort = null;
        if ($viewModeSwitcher->getViewMode() === 'grid') {
            $defaultSort = ['services_severity DESC', 'display_name'];
        }

        $sortControl = $this->createSortControl(
            $servicegroups,
            [
                'display_name'                         => t('Name'),
                'services_severity desc, display_name' => t('Severity'),
                'services_total desc'                  => t('Total Services')
            ],
            $defaultSort
        );

        $searchBar = $this->createSearchBar($servicegroups, [
            $limitControl->getLimitParam(),
            $sortControl->getSortParam(),
            $viewModeSwitcher->getViewModeParam()
        ]);

        if ($searchBar->hasBeenSent() && ! $searchBar->isValid()) {
            if ($searchBar->hasBeenSubmitted()) {
                $filter = $this->getFilter();
            } else {
                $this->addControl($searchBar);
                $this->sendMultipartUpdate();
                return;
            }
        } else {
            $filter = $searchBar->getFilter();
        }

        $this->filter($servicegroups, $filter);

        $servicegroups->peekAhead($compact);

        yield $this->export($servicegroups);

        $this->addControl($paginationControl);
        $this->addControl($sortControl);
        $this->addControl($limitControl);
        $this->addControl($viewModeSwitcher);
        $this->addControl($searchBar);

        $results = $servicegroups->execute();

        $this->addContent(
            (new ServicegroupTable($results))
                ->setBaseFilter($filter)
                ->setViewMode($viewModeSwitcher->getViewMode())
        );

        if ($compact) {
            $this->addContent(
                (new ShowMore($results, Url::fromRequest()->without(['showCompact', 'limit', 'view'])))
                    ->setBaseTarget('_next')
                    ->setAttribute('title', sprintf(
                        t('Show all %d servicegroups'),
                        $servicegroups->count()
                    ))
            );
        }

        if (! $searchBar->hasBeenSubmitted() && $searchBar->hasBeenSent()) {
            $this->sendMultipartUpdate();
        }

        $this->setAutorefreshInterval(30);
    }

    public function completeAction()
    {
        $suggestions = new ObjectSuggestions();
        $suggestions->setModel(Servicegroup::class);
        $suggestions->forRequest(ServerRequest::fromGlobals());
        $this->getDocument()->add($suggestions);
    }

    public function searchEditorAction()
    {
        $editor = $this->createSearchEditor(ServicegroupSummary::on($this->getDb()), [
            LimitControl::DEFAULT_LIMIT_PARAM,
            SortControl::DEFAULT_SORT_PARAM,
            ViewModeSwitcher::DEFAULT_VIEW_MODE_PARAM
        ]);

        $this->getDocument()->add($editor);
        $this->setTitle(t('Adjust Filter'));
    }
}
