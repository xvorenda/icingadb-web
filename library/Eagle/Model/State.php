<?php

namespace Icinga\Module\Eagle\Model;

use ipl\Orm\Model;

/**
 * Base class for the {@link HostState} and {@link ServiceState} models providing common columns.
 */
abstract class State extends Model
{
    public function getColumns()
    {
        return [
            'env_id',
            'state_type',
            'soft_state',
            'hard_state',
            'attempt',
            'severity',
            'output',
            'long_output',
            'performance_data',
            'check_commandline',
            'is_problem',
            'is_handled',
            'is_reachable',
            'is_flapping',
            'is_acknowledged',
            'acknowledgement_comment_id',
            'in_downtime',
            'execution_time',
            'latency',
            'timeout',
            'last_update',
            'last_state_change',
            'last_soft_state',
            'last_hard_state',
            'next_check'
        ];
    }
}
