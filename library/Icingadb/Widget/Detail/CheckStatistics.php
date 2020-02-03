<?php

namespace Icinga\Module\Icingadb\Widget\Detail;

use Icinga\Date\DateFormatter;
use Icinga\Module\Icingadb\Widget\Card;
use Icinga\Module\Icingadb\Widget\CheckAttempt;
use Icinga\Module\Icingadb\Widget\TimeAgo;
use Icinga\Module\Icingadb\Widget\TimeUntil;
use Icinga\Module\Icingadb\Widget\VerticalKeyValue;
use Icinga\Util\Format;
use ipl\Html\BaseHtmlElement;
use ipl\Html\Html;
use ipl\Web\Widget\StateBall;

class CheckStatistics extends Card
{
    protected $object;

    protected $tag = 'div';

    protected $defaultAttributes = ['class' => 'check-statistics'];

    public function __construct($object)
    {
        $this->object = $object;
    }

    protected function assembleBody(BaseHtmlElement $body)
    {
        $hPadding = 10;
        $durationScale = $this->object->state->is_overdue ? 50 : 100;

        $timeline = Html::tag('div', ['class' => 'check-timeline timeline']);

        $overdueBar = null;
        $nextCheckTime = $this->object->state->next_check;
        if ($this->object->state->is_overdue) {
            $leftNow = 100 - $hPadding;
            $nextCheckTime = $this->object->state->next_update;
            $overdueBar = Html::tag('div', [
                'class' => 'progress-bar overdue',
                'style' => 'left: ' .  ($durationScale) . '%; ' .
                           'width: ' . ($leftNow - $durationScale) . '%'
            ]);
        } else {
            $duration = $this->object->check_interval;
            $leftNow = $hPadding + ($duration - ($nextCheckTime - time()))
                / $duration * (100 - 2 * $hPadding);
            if ($leftNow > 97) {
                $leftNow = 97;
            }
            if ($leftNow < $hPadding) {
                $leftNow = $hPadding;
            }
        }

        $above = Html::tag('ul', ['class' => 'above']);
        $now = Html::tag('li', [
            'class' => 'bubble now',
            'style' => 'left: ' . $leftNow . '%',
        ], Html::tag('strong', 'Now'));
        $above->add($now);

        $markerLast = Html::tag('div', [
            'class' => 'marker last',
            'style' => 'left: ' . $hPadding . '%',
            'title' => $this->object->state->last_update !== null
                ? DateFormatter::formatDateTime($this->object->state->last_update)
                : null
        ]);
        $markerNext = Html::tag('div', [
            'class' => 'marker next',
            'style' => 'left: ' .  ($durationScale - ($this->object->state->is_overdue ? 0 : $hPadding)) . '%',
            'title' => DateFormatter::formatDateTime($nextCheckTime)
        ]);
        $markerNow = Html::tag('div', [
            'class' => 'marker now',
            'style' => 'left: ' . $leftNow . '%',
        ]);

        $timeline->add([
            $markerLast,
            $markerNow,
            $markerNext,
            $overdueBar
        ]);

        $lastUpdate = Html::tag(
            'li',
            ['class' => 'bubble upwards last'],
            new VerticalKeyValue('Last update', $this->object->state->last_update !== null
                ? new TimeAgo($this->object->state->last_update)
                : 'PENDING')
        );
        $interval = Html::tag(
            'li',
            ['class' => 'interval'],
            new VerticalKeyValue('Interval', Format::seconds($this->object->check_interval))
        );
        $nextCheck = Html::tag(
            'li',
            ['class' => 'bubble upwards next'],
            new VerticalKeyValue('Next check', new TimeUntil($nextCheckTime))
        );

        $below = Html::tag(
            'ul',
            [
                'class' => 'below',
                'style' => 'width: ' . $durationScale . '%; ' . 'padding-right: '
                    . ($this->object->state->is_overdue ? 0 : $hPadding) . '%; '
            ]
        );
        $below->add([
            $lastUpdate,
            $interval,
            $nextCheck
        ]);

        $body->add([$above, $timeline, $below]);
    }

    protected function assembleFooter(BaseHtmlElement $footer)
    {
    }

    protected function assembleHeader(BaseHtmlElement $header)
    {
        $checkSource = [
            new StateBall($this->object->state->is_reachable ? 'up' : 'down', StateBall::SIZE_MEDIUM),
            ' ',
            $this->object->state->check_source
        ];

        $header->add([
            new VerticalKeyValue('Command', $this->object->checkcommand),
            new VerticalKeyValue(
                'Attempts',
                new CheckAttempt($this->object->state->attempt, $this->object->max_check_attempts)
            ),
            new VerticalKeyValue('Check source', $checkSource),
            new VerticalKeyValue('Execution time', Format::seconds($this->object->state->execution_time)),
            new VerticalKeyValue('Latency', Format::seconds($this->object->state->latency))
        ]);
    }
}
